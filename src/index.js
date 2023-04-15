import { glMatrix, mat4, vec3 } from 'gl-matrix'
import { initializeProgram, createAndSetupTexture, resizeViewport } from './webgl-utils'
import vertexShaderSource from './shaders/vertex.glsl'
import fragmentShaderSource from './shaders/fragment.glsl'
import WorldState from './world-state.json'


const HALTON_SAMPLES = 36
let haltonSequence = []
function CreateHaltonSequence(index, base)
{
    let f = 1.0;
    let r = 0.0;
    let current = index;
    do {
        f = f / base;
        r = r + f * (current % base);
        current = Math.floor(current / base);
    } while (current > 0);
    return r;
}
for (let iter = 0; iter < HALTON_SAMPLES; iter++) {
    haltonSequence.push([CreateHaltonSequence(iter+1, 2), CreateHaltonSequence(iter+1, 3)]);
}


// ===== INITIALIZATION =====
const fpsElem = document.getElementById('fps');
let usingA = true
let enableTAA = true
let resetTAA = false
let rotatingCamera = false
let keyDownW = false
let keyDownA = false
let keyDownS = false
let keyDownD = false
let deltaTime = 0
let then = 0
let fps = 1
let fpsStart = performance.now()
let fpsFrameCount = 0
let frameNumberTAA = 1
let jitterSampleIdx = 0

// Create WebGL 2 context
const canvas = document.querySelector("#canvas");
const gl = canvas.getContext("webgl2", {
    powerPreference: "high-performance",
    antialias: false,
    alpha: true, // Disabling alpha also disables vsync
    stencil: false,
    depth: false,
    desynchronized: false, // Enabling low latency mode also requires that alpha is false
    preserveDrawingBuffer: false
});

const ext = gl.getExtension("EXT_color_buffer_float")
if (!ext) {
    console.log("Cannot render to floating point textures!")
}

const program = initializeProgram(gl, vertexShaderSource, fragmentShaderSource)


// Get shader uniform locations.
const u_runTAA = gl.getUniformLocation(program, 'u_runTAA')
const u_enableGI = gl.getUniformLocation(program, 'u_enableGI')
const u_enableRefGI = gl.getUniformLocation(program, 'u_enableRefGI')
const u_enableTonemapping = gl.getUniformLocation(program, 'u_enableTonemapping')
const u_enableGammaCorrection = gl.getUniformLocation(program, 'u_enableGammaCorrection')
const u_enablePlaneBacksides = gl.getUniformLocation(program, 'u_enablePlaneBacksides')
const u_enablePlaneMirrors = gl.getUniformLocation(program, 'u_enablePlaneMirrors')
const u_randomseed = gl.getUniformLocation(program, 'u_randomseed')
const u_taaBlendFactor = gl.getUniformLocation(program, 'u_taaBlendFactor')
const u_directSamples = gl.getUniformLocation(program, 'u_directSamples')
const u_directSamplesSqrt = gl.getUniformLocation(program, 'u_directSamplesSqrt')
const u_indirectSamples = gl.getUniformLocation(program, 'u_indirectSamples')
const u_rcp_indirectSamples = gl.getUniformLocation(program, 'u_rcp_indirectSamples')
const u_reflectionBounces = gl.getUniformLocation(program, 'u_reflectionBounces')
const u_accumTexture = gl.getUniformLocation(program, "u_accumTexture")

const sphereZeroPosLoc = gl.getUniformLocation(program, 'sphereCenters[0]')


// --- Framebuffer A ---
const framebufferA = gl.createFramebuffer()
gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferA)

const finalTexture = createAndSetupTexture(gl)
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null)
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, finalTexture, 0)

const textureA = createAndSetupTexture(gl)
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null)
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, textureA, 0)

gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1 ])
gl.readBuffer(gl.COLOR_ATTACHMENT0)

// --- Framebuffer B ---
const framebufferB = gl.createFramebuffer()
gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferB)

gl.bindTexture(gl.TEXTURE_2D, finalTexture)
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, finalTexture, 0)

const textureB = createAndSetupTexture(gl)
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null)
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, textureB, 0)

gl.drawBuffers([ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1 ])
gl.readBuffer(gl.COLOR_ATTACHMENT0)


let syncs = [ null, null, null, null, null ]
let sync_i = 0

function syncFrame(vsync) {
    const next_i = (sync_i+1) % 5
    const status = syncs[next_i] != null ? gl.getSyncParameter(syncs[next_i], gl.SYNC_STATUS) : gl.SIGNALED

    if (status == gl.SIGNALED) { // rendering is complete -> start next frame
        sync_i = next_i
        syncs[sync_i] = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
        if (vsync)
            requestAnimationFrame(render)
        else
            Promise.resolve(1).then(render)
        return
    }
    
    setTimeout(syncFrame, 0)
}


// ===== RENDERLOOP =====
function render() {
    let now = performance.now()
    deltaTime = (now - then) / 1000.0
    then = now

    const moving = rotatingCamera || keyDownW || keyDownA || keyDownS || keyDownD
    if (moving) {
        updateCamera(deltaTime)
        rotatingCamera = false
    }

    let runTAA = enableTAA
    if (resetTAA && enableTAA) {
        resetTAA = false
        runTAA = false
        frameNumberTAA = 1
    }

    if (runTAA) {
        updateJitterTAA()
        jitterSampleIdx++
    }

    if (!runTAA || jitterSampleIdx >= HALTON_SAMPLES)
        jitterSampleIdx = 0

    // When true render accumulation/TAA is enabled and framelimiter/V-sync is disabled. 
    const accumulationRender = !moving && runTAA
    
    gl.uniform1i(u_runTAA, runTAA)
    
    //updateLightRotation(deltaTime)
    //updateSpherePosition(deltaTime)

    // Set random seed for each frame, so that noise doesn't stay static between frames
    gl.uniform1f(u_randomseed, Math.random())
    
    if (enableTAA) {
        // --- Draw the scene to a texture ---
        // Ping pong between two framebuffers
        const fb = usingA ? framebufferA : framebufferB

        // render to texture located in color attachement 0 by binding the framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb)

        // Bind the texture of previous frame
        gl.bindTexture(gl.TEXTURE_2D, usingA ? textureB : textureA)

        // Clear the attachment(s).
        gl.clearColor(0, 0, 0, 1)
        gl.clear(gl.COLOR_BUFFER_BIT)

        // Tell the shader to use texture unit 0 for u_texture
        gl.uniform1i(u_accumTexture, 0)

        // The amount of how much to blend this frame to the result
        gl.uniform1f(u_taaBlendFactor, 1.0/frameNumberTAA)

        // Render the scene
        gl.drawArrays(gl.TRIANGLES, 0, 3)

        // Present only at 30 fps when accumulating
        if (!accumulationRender || frameNumberTAA % Math.max(1, Math.floor(fps/30)) == 0) {
            // --- Draw the texture to canvas ---
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb); // Reading from color attachment 0 (gl.readBuffer above)
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
            gl.blitFramebuffer(0, 0, gl.canvas.width, gl.canvas.height, 0, 0, gl.canvas.width, gl.canvas.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        }

        usingA = !usingA
    }
    else {
        // --- Draw the scene directly to canvas ---
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    frameNumberTAA++
    fpsFrameCount++

    const fpsTime = (now - fpsStart) / 1000.0
    if (fpsTime >= 0.5) {
        fpsStart = now
        fps = fpsFrameCount/fpsTime
        fpsElem.innerText = Math.round(fps)
        if (!accumulationRender)
            fpsElem.innerText += " (VSync)"
        fpsFrameCount = 0
    }
    
    syncFrame(!accumulationRender)
}

function present() {
    const fb = framebufferA
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, gl.canvas.width, gl.canvas.height, 0, 0, gl.canvas.width, gl.canvas.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    requestAnimationFrame(present)
}

// ===== UNIFORM UPDATES =====
let enableGI = true
let enableRefGI = true
let indirectSamples = 10
let reflectionBounces = 1
let enableAreaLights = true;
let shadowSamples = 4;
let enablePlaneBacksides = true;
let enablePlaneMirrors = false;

let xmove = 0
let moveinv = 1.0

let near = WorldState.camera.near
let far = WorldState.camera.far
let fovY = WorldState.camera.fovY
let camX = WorldState.camera.x
let camY = WorldState.camera.y
let camZ = WorldState.camera.z
let yaw = WorldState.camera.yaw
let pitch = WorldState.camera.pitch
let projectionMatrix = mat4.create()
let rotY = mat4.create()
let rotX = mat4.create()
let translationMatrix = mat4.create()
let viewMatrix = mat4.create()
let inverseProjectionViewMatrix = mat4.create()

function updateJitterTAA() {
    const deltaWidth = 1.0 / gl.canvas.width;
    const deltaHeight = 1.0 / gl.canvas.height;
    const jitterX = (haltonSequence[jitterSampleIdx][0]*2-1) * deltaWidth
    const jitterY = (haltonSequence[jitterSampleIdx][1]*2-1) * deltaHeight
    const jitterMat = mat4.fromValues(1,0,0,0, 0,1,0,0, 0,0,1,0, jitterX,jitterY,0,1)
    mat4.mul(jitterMat, inverseProjectionViewMatrix, jitterMat)
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'invprojview'), false, jitterMat)
}

function updateCamera(delta) {
    if (keyDownW) {
        camX += delta*4 * Math.cos(pitch) * Math.cos(yaw + (Math.PI/2));
        camY += delta*4 * Math.sin(pitch);
        camZ -= delta*4 * Math.cos(pitch) * Math.sin(yaw + (Math.PI/2));
    }
    if (keyDownS) {
        camX -= delta*4 * Math.cos(pitch) * Math.cos(yaw + (Math.PI/2));
        camY -= delta*4 * Math.sin(pitch);
        camZ += delta*4 * Math.cos(pitch) * Math.sin(yaw + (Math.PI/2));
    }
    if (keyDownA) {
        camX += delta*4 * Math.cos(yaw + Math.PI);
        camZ -= delta*4 * Math.sin(yaw + Math.PI);
    }
    if (keyDownD) {
        camX += delta*4 * Math.cos(yaw);
        camZ -= delta*4 * Math.sin(yaw);
    }

    mat4.perspective(projectionMatrix, fovY, gl.canvas.width / gl.canvas.height, near, far) // perspective matrix
    mat4.fromYRotation(rotY, yaw) // left-right rotation matrix
    mat4.fromXRotation(rotX, pitch) // up-down rotation matrix
    mat4.fromTranslation(translationMatrix, [camX, camY, camZ]) // translation matrix

    mat4.mul(viewMatrix, rotY, rotX)                            // rotate along x -> rotate along y
    mat4.mul(viewMatrix, translationMatrix, viewMatrix)         // translate rotated view to position
    mat4.invert(viewMatrix, viewMatrix)
    mat4.mul(inverseProjectionViewMatrix, projectionMatrix, viewMatrix)
    mat4.invert(inverseProjectionViewMatrix, inverseProjectionViewMatrix)
    
    gl.uniform1f(gl.getUniformLocation(program, 'near'), near)
    gl.uniform1f(gl.getUniformLocation(program, 'far'), far)
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'invprojview'), false, inverseProjectionViewMatrix)

    resetTAA = true;
}

function updatePlanes() {
    let renderPlanes = []
    for (let i = 0; i < WorldState.planes.length; i++) {
        if (WorldState.planes[i].enabled) renderPlanes.push(WorldState.planes[i])
    }
    const numPlanes = renderPlanes.length;
    gl.uniform1i(gl.getUniformLocation(program, 'numPlanes'), numPlanes)
    for (let i = 0; i < numPlanes; i++) {
        const offsetLoc = gl.getUniformLocation(program, 'planeOffsets[' + i + ']')
        const normalLoc = gl.getUniformLocation(program, 'planeNormals[' + i + ']')
        const colLoc = gl.getUniformLocation(program, 'planeColors[' + i + ']')
        const planeSpecularLoc = gl.getUniformLocation(program, 'planeSpecular[' + i + ']')
        const planeRoughnessLoc = gl.getUniformLocation(program, 'planeRoughness[' + i + ']')
        gl.uniform1f(offsetLoc, renderPlanes[i].offset)
        gl.uniform3f(normalLoc, renderPlanes[i].x, renderPlanes[i].y, renderPlanes[i].z)
        gl.uniform3f(colLoc, renderPlanes[i].r, renderPlanes[i].g, renderPlanes[i].b)
        gl.uniform1f(planeSpecularLoc, renderPlanes[i].specular)
        gl.uniform1f(planeRoughnessLoc, renderPlanes[i].roughness)
    }

    resetTAA = true;
}

function updateSpheres() {
    const numSpheres = WorldState.spheres.length
    gl.uniform1i(gl.getUniformLocation(program, 'numSpheres'), numSpheres)

    for (let i = 0; i < numSpheres; i++) {
        const sphere = WorldState.spheres[i];
        const posLoc = gl.getUniformLocation(program, 'sphereCenters[' + i + ']')
        const colLoc = gl.getUniformLocation(program, 'sphereColors[' + i + ']')
        const refColLoc = gl.getUniformLocation(program, 'reflectiveColors[' + i + ']')
        const specColLoc = gl.getUniformLocation(program, 'sphereSpecColors[' + i + ']')
        const sphereRoughnessLoc = gl.getUniformLocation(program, 'sphereRoughness[' + i + ']')
        gl.uniform3f(posLoc, sphere.x, sphere.y, sphere.z)
        gl.uniform3f(colLoc, sphere.r, sphere.g, sphere.b)
        gl.uniform3f(refColLoc, sphere.rr, sphere.rg, sphere.rb)
        gl.uniform3f(specColLoc, sphere.sr, sphere.sg, sphere.sb)
        gl.uniform1f(sphereRoughnessLoc, sphere.roughness)
    }

    resetTAA = true;
}

function updateSpherePosition(delta) {
    if (xmove > 3.0) {
        xmove = 3.0
        moveinv = -1.0
    }
    else if (xmove < -3.0) {
        xmove = -3.0
        moveinv = 1.0
    }
    xmove += moveinv * delta
    WorldState.spheres[0].x = xmove
    gl.uniform3f(sphereZeroPosLoc, WorldState.spheres[0].x, WorldState.spheres[0].y, WorldState.spheres[0].z)
}

function updateLights() {
    const renderLights = WorldState.lights.filter(light => light.enabled)
    const numLights = renderLights.length;
    gl.uniform1i(gl.getUniformLocation(program, 'numLights'), numLights)

    for (let i = 0; i < numLights; i++) {
        const light = renderLights[i];
        const posLoc = gl.getUniformLocation(program, 'lightPos[' + i + ']')
        const sizeLoc = gl.getUniformLocation(program, 'lightSize[' + i + ']')
        const colLoc = gl.getUniformLocation(program, 'u_lightEmission[' + i + ']')
        const spotLoc = gl.getUniformLocation(program, 'lightSpot[' + i + ']')
        gl.uniform3f(posLoc, light.x, light.y, light.z)
        gl.uniform2f(sizeLoc, enableAreaLights ? light.sizeX : 0, enableAreaLights ? light.sizeY : 0)
        gl.uniform3f(colLoc, light.r * light.brightness, light.g * light.brightness, light.b * light.brightness)
        gl.uniform2f(spotLoc, light.spotSize, light.spotIntensity)
    }

    resetTAA = true;
}

function updateLightRotation(delta) {
    const renderLights = WorldState.lights.filter(light => light.enabled)
    const numLights = renderLights.length;

    for (let i = 0; i < numLights; i++) {
        const light = renderLights[i];
        let lightPos = vec3.create()
        if (light.rotate) {
            const lightRot = delta * 0.5
            vec3.rotateY(lightPos, [light.x, light.y, light.z], [0,0,0], lightRot)
            light.x = lightPos[0];
            light.y = lightPos[1];
            light.z = lightPos[2];
        }
        gl.uniform3f(gl.getUniformLocation(program, 'lightPos[' + i + ']'), light.x, light.y, light.z)
    }
}

function updateRenderingSettings() {
    gl.uniform3f(gl.getUniformLocation(program, 'ambientLight'), 0.01, 0.01, 0.01)
    gl.uniform1i(u_enableGI, enableGI)
    gl.uniform1i(u_enableRefGI, enableRefGI)
    gl.uniform1i(u_enablePlaneBacksides, enablePlaneBacksides)
    gl.uniform1i(u_enablePlaneMirrors, enablePlaneMirrors)
    const shadowDim = Math.floor(Math.sqrt(shadowSamples))
    gl.uniform1f(u_directSamplesSqrt, shadowDim)
    gl.uniform1i(u_directSamples, Math.pow(shadowDim, 2)) // number of samples is forced to power of 2
    gl.uniform1i(u_indirectSamples, indirectSamples)
    gl.uniform1f(u_rcp_indirectSamples, 1.0/indirectSamples)
    gl.uniform1i(u_reflectionBounces, reflectionBounces)

    resetTAA = true;
}

function resizeCanvas() {
    canvas.style.width = window.innerWidth
    canvas.style.height = window.innerHeight
    const width = Math.floor(window.innerWidth * window.devicePixelRatio);
    const height = Math.floor(window.innerHeight * window.devicePixelRatio);

    gl.bindTexture(gl.TEXTURE_2D, finalTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindTexture(gl.TEXTURE_2D, textureA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindTexture(gl.TEXTURE_2D, textureB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    resizeViewport(gl, width, height)
    updateCamera()

    // Don't run TAA on first frame after textures have been cleared (they are pure black, which affects the color averaging)
    frameNumberTAA = 1
}

resizeCanvas()
updatePlanes()
updateSpheres()
updateLights()
updateRenderingSettings()
render()


// ===== INPUT EVENT HANDLING =====

// Add light inputs to html
function addLightInputs(i, lightArr) {
    const container = document.getElementById("lightcontrols");
    const htmlStr = `
        <br>
        <b>light ${i+1}</b><br>
        <input type="checkbox" ${lightArr[i].enabled && "checked"} id="${i}" class="light-enable"> on/off<br>
        <table class="sliders">
            <tr>
                <td><label>Bright:</label></td>
                <td><input type="range" min="0" max="5" step="0.01" value="${Math.log10(lightArr[i].brightness)}" id="${i}" class="light-brightness"></td>
            </tr>
            <tr>
                <td><label>Spot cone:</label></td>
                <td><input type="range" min="0" max="3.15" step="0.01" value="${lightArr[i].spotSize}" id="${i}" class="light-spotsize"></td>
            </tr>
            <tr>
                <td><label>r:</label></td>
                <td><input type="range" min="0" max="1" value="1" step="0.1" id="${i}r" class="light-color"></td>
            </tr>
            <tr>
                <td><label>g:</label></td>
                <td><input type="range" min="0" max="1" value="1" step="0.1" id="${i}g" class="light-color"></td>
            </tr>
            <tr>
                <td><label>b:</label></td>
                <td><input type="range" min="0" max="1" value="1" step="0.1" id="${i}b" class="light-color"></td>
            </tr>
                <td><label>sizeX:</label></td>
                <td><input type="range" min="0" max="3" step="0.01" value="${lightArr[i].sizeX}" id="${i}x" class="light-size"></td>
            <tr>
                <td><label>sizeY:</label></td>
                <td><input type="range" min="0" max="3" step="0.01" value="${lightArr[i].sizeY}" id="${i}y" class="light-size"></td>
            </tr>
        </table>`;
    container.insertAdjacentHTML('beforeend', htmlStr);
}
function addPlaneInputs(i, planeArr) {
    const container = document.getElementById("planecontrols");
    const htmlStr = `
        <input type="checkbox" id="${i}" class="plane-enable" ${planeArr[i].enabled && "checked"}><b>${planeArr[i].desc}</b><br>`;
    container.insertAdjacentHTML('beforeend', htmlStr);
}
for (let i = 0; i < WorldState.lights.length; i++) {
    addLightInputs(i, WorldState.lights);
}
for (let i = 0; i < WorldState.planes.length; i++) {
    addPlaneInputs(i, WorldState.planes);
}

function handleKeys(code, down) {
    switch(code) {
        case 'KeyW':
            keyDownW = down;
            break;
        case 'KeyS':
            keyDownS = down;
            break;
        case 'KeyA':
            keyDownA = down;
            break;
        case 'KeyD':
            keyDownD = down;
            break;
    }
}

window.addEventListener('resize', resizeCanvas)
document.addEventListener('mousedown', e => {
    if (!e.target.closest('.controls')) { // register mousepresses only if it occured outside of control panel
        if (e.button == 2) {
          if (document.pointerLockElement === e.target)
            document.exitPointerLock()
          else
            e.target.requestPointerLock() // Set pointerlock and hide cursor
        }
      }
})
document.addEventListener('mousemove', e => {
    if (document.pointerLockElement?.id === 'canvas') {
        yaw -= e.movementX*0.0015
        pitch -= e.movementY*0.0015
        rotatingCamera = true
    }
})
document.addEventListener('keydown', e => handleKeys(e.code, true))
document.addEventListener('keyup', e => handleKeys(e.code, false))

document.getElementById('enableUI').addEventListener('input', event => {
    document.getElementsByClassName('controls')[0].style.display = event.target.checked ? 'block' : 'none'
})

// General rendering setting inputs
document.getElementById('enableTAA').addEventListener('input', event => {
    enableTAA = event.target.checked
    resizeCanvas() // Clear textures
})
document.getElementById('enableGI').addEventListener('input', event => {
    enableGI = event.target.checked
    updateRenderingSettings()
})
document.getElementById('enableRefGI').addEventListener('input', event => {
    enableRefGI = event.target.checked
    updateRenderingSettings()
})
const elem_indirectsamples = document.getElementById('indirectsamples')
elem_indirectsamples.addEventListener('input', event => {
    indirectSamples = event.target.value
    elem_indirectsamples.nextElementSibling.value = event.target.value
    updateRenderingSettings()
})
document.getElementById('directsamples').addEventListener('input', event => {
    shadowSamples = event.target.value * event.target.value
    updateRenderingSettings()
})
document.getElementById('reflectionbounces').addEventListener('input', event => {
    reflectionBounces = event.target.value
    updateRenderingSettings()
})
document.getElementById('fov').addEventListener('input', event => {
    fovY = glMatrix.toRadian(event.target.value)
    updateCamera()
})

// Light inputs
document.getElementById('arealightsenable').addEventListener('input', event => {
    enableAreaLights = event.target.checked
    updateLights()
});
document.querySelectorAll('.light-enable').forEach(item => {
    item.addEventListener('input', event => {
        WorldState.lights[event.target.id].enabled = event.target.checked
        updateLights()
    })
})
document.querySelectorAll('.light-brightness').forEach(item => {
    item.addEventListener('input', event => {
        WorldState.lights[event.target.id].brightness = Math.pow(10, event.target.value)
        updateLights()
    })
})
document.querySelectorAll('.light-spotsize').forEach(item => {
    item.addEventListener('input', event => {
        WorldState.lights[event.target.id].spotSize = event.target.value
        updateLights()
    })
})
document.querySelectorAll('.light-spotintensity').forEach(item => {
    item.addEventListener('input', event => {
        WorldState.lights[event.target.id].spotIntensity = event.target.value
        updateLights()
    })
})
document.querySelectorAll('.light-color').forEach(item => {
    item.addEventListener('input', event => {
        const light = WorldState.lights[event.target.id[0]]
        if (event.target.id[1] === "r")
            light.r = event.target.value
        else if (event.target.id[1] === "g")
            light.g = event.target.value
        else if (event.target.id[1] === "b")
            light.b = event.target.value
        updateLights()
    })
})
document.querySelectorAll('.light-size').forEach(item => {
    item.addEventListener('input', event => {
        const light = WorldState.lights[event.target.id[0]]
        if (event.target.id[1] === "x")
            light.sizeX = event.target.value
        else if (event.target.id[1] === "y")
            light.sizeY = event.target.value
        updateLights()
    })
})

// Plane inputs
document.querySelectorAll('.plane-enable').forEach(item => {
    item.addEventListener('input', event => {
        WorldState.planes[event.target.id].enabled = event.target.checked
        updatePlanes()
    })
})
document.getElementById('planebacksides').addEventListener('input', event => {
    enablePlaneBacksides = event.target.checked
    updateRenderingSettings()
})

// Extras
document.getElementById('enablemirrorworld').addEventListener('input', event => {
    enablePlaneMirrors = event.target.checked

    enablePlaneBacksides = false
    document.getElementById('planebacksides').checked = false

    for (let i = 0; i < WorldState.planes.length; i++) {
        WorldState.planes[i].enabled = true
    }
    document.querySelectorAll('.plane-enable').forEach(item => {
        item.checked = true
    })

    enableRefGI = false
    document.getElementById('enableRefGI').checked = false

    reflectionBounces = 5
    document.getElementById('reflectionbounces').value = 5
    document.getElementById('reflectionbounces').nextElementSibling.value = 5

    updatePlanes()
    updateRenderingSettings()
})

document.getElementById('increasedlimits').addEventListener('input', event => {
    document.getElementById('indirectsamples').setAttribute("max", 200)
    document.getElementById('reflectionbounces').setAttribute("max", 100)
    document.getElementById('fov').setAttribute("max", 179)
    document.getElementById('fov').setAttribute("min", 0.01)
    document.getElementById('fov').setAttribute("step", 0.01)
})