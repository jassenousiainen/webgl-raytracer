import { glMatrix, mat4, vec3 } from 'gl-matrix'
import { initializeProgram, createAndSetupTexture, resizeViewport } from './webgl-utils'
import vertexShaderSource from './shaders/vertex.glsl'
import fragmentShaderSource from './shaders/fragment.glsl'
import WorldState from './world-state.json'

// ===== INITIALIZATION =====
const fpsElem = document.getElementById('fps');
let usingA = true
let enableTAA = true
let rotatingCamera = false
let keyDownW = false
let keyDownA = false
let keyDownS = false
let keyDownD = false
let deltaTime = 0;
let then = 0;
let frameNumber = 0;
let avgFps = 0

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
const program = initializeProgram(gl, vertexShaderSource, fragmentShaderSource)

// Defining uniform locations that are accessed frequently
const runTAALoc = gl.getUniformLocation(program, 'enableTAA')
const randLoc = gl.getUniformLocation(program, 'randomseed')
const sphereZeroPosLoc = gl.getUniformLocation(program, 'sphereCenters[0]')
const textureLocation = gl.getUniformLocation(program, "u_texture")


// --- Framebuffer A ---
// Create a texture to render to
const textureA = createAndSetupTexture(gl);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

// Create and bind the framebuffer
const framebufferA = gl.createFramebuffer();
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebufferA);

// attach the texture as the first color attachment
gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureA, 0);

// --- Framebuffer B ---
const textureB = createAndSetupTexture(gl);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
const framebufferB = gl.createFramebuffer();
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebufferB);
gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textureB, 0);


// ===== RENDERLOOP =====
function drawScene(now) {
    now = (now || 0) * 0.001
    deltaTime = now - then
    then = now;
    frameNumber += 1

    if (frameNumber != 0)
        avgFps += 1.0/deltaTime

    let runTAA = enableTAA && frameNumber != 0
    if (rotatingCamera || keyDownW || keyDownA || keyDownS || keyDownD) {
        updateCamera(deltaTime)
        rotatingCamera = false
        runTAA = false
    }
    if (runTAA) {
        updateJitterTAA()
    }
    gl.uniform1i(runTAALoc, runTAA)
    
    //updateLightRotation(deltaTime)
    //updateSpherePosition(deltaTime)

    // Set random seed for each frame, so that noise doesn't stay static between frames
    gl.uniform1f(randLoc, Math.random())
    
    if (enableTAA) {
        // --- Draw the scene to a texture ---
        // Ping pong between two framebuffers
        const fb = usingA ? framebufferA : framebufferB

        // render to texture located in color attachement 0 by binding the framebuffer
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb);

        // Bind the texture of previous frame
        gl.bindTexture(gl.TEXTURE_2D, usingA ? textureB : textureA);

        // Clear the attachment(s).
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Tell the shader to use texture unit 0 for u_texture
        gl.uniform1i(textureLocation, 0);

        // Render the scene
        gl.drawArrays(gl.TRIANGLES, 0, 3)

        // --- Draw the texture to canvas ---
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.blitFramebuffer(0, 0, gl.canvas.width, gl.canvas.height, 0, 0, gl.canvas.width, gl.canvas.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);

        usingA = !usingA
    }
    else {
        // --- Draw the scene directly to canvas ---
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    
    if (frameNumber == 50) {
        fpsElem.innerText = Math.round(avgFps/50)
        avgFps = 0
        frameNumber = 0
    }

    requestAnimationFrame(drawScene)
}

// ===== UNIFORM UPDATES =====
let enableGI = true
let enableRefGI = true
let indirectSamples = 50
let reflectionBounces = 1
let enableAreaLights = true;
let shadowSamples = 9;
let enablePlaneBacksides = true;
let enablePlaneMirrors = false;
let quadraticAttenuation = 1.5;
let linearAttenuation = 0;

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
    const jitterX = (Math.random() * 2 - 1) * deltaWidth
    const jitterY = (Math.random() * 2 - 1) * deltaHeight
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
        const colLoc = gl.getUniformLocation(program, 'lightBrightness[' + i + ']')
        const spotLoc = gl.getUniformLocation(program, 'lightSpot[' + i + ']')
        gl.uniform3f(posLoc, light.x, light.y, light.z)
        gl.uniform2f(sizeLoc, enableAreaLights ? light.sizeX : 0, enableAreaLights ? light.sizeY : 0)
        gl.uniform3f(colLoc, light.r * light.brightness, light.g * light.brightness, light.b * light.brightness)
        gl.uniform2f(spotLoc, light.spotSize, light.spotIntensity)
    }
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
    gl.uniform1i(gl.getUniformLocation(program, 'enableGI'), enableGI)
    gl.uniform1i(gl.getUniformLocation(program, 'enableRefGI'), enableRefGI)
    gl.uniform1i(gl.getUniformLocation(program, 'indirectSamples'), indirectSamples)
    gl.uniform1i(gl.getUniformLocation(program, 'rayBounces'), reflectionBounces)
    const shadowDim = Math.floor(Math.sqrt(shadowSamples))
    gl.uniform1f(gl.getUniformLocation(program, 'shadowDim'), shadowDim)
    gl.uniform1i(gl.getUniformLocation(program, 'shadowSamples'), Math.pow(shadowDim, 2)) // number of samples is forced to power of 2
    gl.uniform1i(gl.getUniformLocation(program, 'enablePlaneBacksides'), enablePlaneBacksides)
    gl.uniform1i(gl.getUniformLocation(program, 'enablePlaneMirrors'), enablePlaneMirrors)
    gl.uniform2f(gl.getUniformLocation(program, 'attenuationFactor'), quadraticAttenuation, linearAttenuation)
}

function resizeCanvas() {
    canvas.style.width = window.innerWidth
    canvas.style.height = window.innerHeight
    const width = Math.floor(window.innerWidth * window.devicePixelRatio);
    const height = Math.floor(window.innerHeight * window.devicePixelRatio);

    gl.bindTexture(gl.TEXTURE_2D, textureA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindTexture(gl.TEXTURE_2D, textureB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    resizeViewport(gl, width, height)
    updateCamera()

    // Don't run TAA on first frame after textures have been cleared (they are pure black, which affects the color averaging)
    frameNumber = -1
}

resizeCanvas()
updatePlanes()
updateSpheres()
updateLights()
updateRenderingSettings()
drawScene()


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
                <td><input type="range" min="0" max="200" step="0.1" value="${lightArr[i].brightness}" id="${i}" class="light-brightness"></td>
            </tr>
            <tr>
                <td><label>Spot size:</label></td>
                <td><input type="range" min="0" max="1" step="0.01" value="${1-lightArr[i].spotSize}" id="${i}" class="light-spotsize"></td>
            </tr>
            <tr>
                <td><label>Spot falloff:</label></td>
                <td><input type="range" min="0" max="4" step="0.01" value="${lightArr[i].spotIntensity}" id="${i}" class="light-spotintensity"></td>
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
document.getElementById('indirectsamples').addEventListener('input', event => {
    indirectSamples = event.target.value
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
document.querySelectorAll('.attenuation').forEach(item => {
    item.addEventListener('input', event => {
        if (event.target.id === "quadratic")
            quadraticAttenuation = event.target.value
        else if (event.target.id === "linear")
            linearAttenuation = event.target.value
        updateRenderingSettings()
    })
})
document.querySelectorAll('.light-enable').forEach(item => {
    item.addEventListener('input', event => {
        WorldState.lights[event.target.id].enabled = event.target.checked
        updateLights()
    })
})
document.querySelectorAll('.light-brightness').forEach(item => {
    item.addEventListener('input', event => {
        WorldState.lights[event.target.id].brightness = event.target.value
        updateLights()
    })
})
document.querySelectorAll('.light-spotsize').forEach(item => {
    item.addEventListener('input', event => {
        WorldState.lights[event.target.id].spotSize = 1 - event.target.value
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
    document.getElementById('fov').setAttribute("min", 1)
})