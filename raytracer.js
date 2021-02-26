const { mat4, mat3, vec3 } = glMatrix;

// ========== INITIALIZATION ==========

// --- Create WebGLRenderingContext ---
const canvas = document.querySelector("#c");
const gl = canvas.getContext("webgl2");

const vertexShaderSource = document.querySelector("#vertex-shader").text;       // Get the shader code from inline HTML
const fragmentShaderSource = document.querySelector("#fragment-shader-fast").text;
let program = initializeProgram(gl, vertexShaderSource, fragmentShaderSource)

let mousePressed = false
let keyDownW = false
let keyDownA = false
let keyDownS = false
let keyDownD = false
let then = 0;

const fpsElem = document.getElementById('fps');

// ===== RENDERING =====
function drawScene(now) {
    now *= 0.001;
    const deltaTime = now - then;
    then = now;
    fpsElem.innerText = Math.floor(1.0/deltaTime);

    if (mousePressed || keyDownW || keyDownA || keyDownS || keyDownD) { // Camera movement is tied to framerate to make it smoother
        updateCamera()
    }

    updateLightRotation(deltaTime)
    updateSpherePosition(deltaTime)
    
    gl.uniform1f(gl.getUniformLocation(program, 'randomseed'), Math.random())

    // ----- Draw -----
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(drawScene);
}
// start loop
requestAnimationFrame(drawScene);


// ===== UNIFORM UPDATES =====
let enableGI = false
let enableRefGI = false
let indirectSamples = 50
let reflectionBounces = 3
let enableAreaLights = true;
let shadowSamples = 9;
let enablePlaneBacksides = true;
let enablePlaneMirrors = false;
let quadraticAttenuation = 1.5;
let linearAttenuation = 0;

let xmove = 0
let moveinv = 1.0

let near = 0.1
let far = 50
let projectionMatrix = mat4.create()
let yaw = 0
let pitch = -0.12
let camX = 0
let camY = 2
let camZ = 16
let rotY = mat4.create()
let rotX = mat4.create()
let translationMatrix = mat4.create()
let viewMatrix = mat4.create()
let inverseProjectionViewMatrix = mat4.create()

function updateCamera() {
    if (keyDownW) {
        camX += Math.cos(pitch) * Math.cos(yaw + (Math.PI/2)) * 0.05;
        camY += Math.sin(pitch) * 0.05;
        camZ -= Math.cos(pitch) * Math.sin(yaw + (Math.PI/2)) * 0.05;
    }
    if (keyDownS) {
        camX -= Math.cos(pitch) * Math.cos(yaw + (Math.PI/2)) * 0.05;
        camY -= Math.sin(pitch) * 0.05;
        camZ += Math.cos(pitch) * Math.sin(yaw + (Math.PI/2)) * 0.05;
    }
    if (keyDownA) {
        camX += Math.cos(yaw + Math.PI) * 0.05;
        camZ -= Math.sin(yaw + Math.PI) * 0.05;
    }
    if (keyDownD) {
        camX += Math.cos(yaw) * 0.05;
        camZ -= Math.sin(yaw) * 0.05;
    }

    mat4.perspective(projectionMatrix, 0.6, gl.canvas.width / gl.canvas.height, near, far)  // perspective matrix
    mat4.fromYRotation(rotY, yaw);                                                          // left-right rotation matrix
    mat4.fromXRotation(rotX, pitch);                                                        // up-down rotation matrix
    mat4.fromTranslation(translationMatrix, [camX, camY, camZ])                             // translation matrix

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
        gl.uniform1f(offsetLoc, renderPlanes[i].offset)
        gl.uniform3f(normalLoc, renderPlanes[i].x, renderPlanes[i].y, renderPlanes[i].z)
        gl.uniform3f(colLoc, renderPlanes[i].r, renderPlanes[i].g, renderPlanes[i].b)
    }
}

function updateSpheres() {
    const numSpheres = WorldState.spheres.length
    gl.uniform1i(gl.getUniformLocation(program, 'numSpheres'), numSpheres)

    for (let i = 0; i < numSpheres; i++) {
        const sphere = WorldState.spheres[i];
        posLoc = gl.getUniformLocation(program, 'sphereCenters[' + i + ']')
        colLoc = gl.getUniformLocation(program, 'sphereColors[' + i + ']')
        refColLoc = gl.getUniformLocation(program, 'reflectiveColors[' + i + ']')
        gl.uniform3f(posLoc, sphere.x, sphere.y, sphere.z)
        gl.uniform3f(colLoc, sphere.r, sphere.g, sphere.b)
        gl.uniform3f(refColLoc, sphere.rr, sphere.rg, sphere.rb)
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
    gl.uniform3f(gl.getUniformLocation(program, 'sphereCenters[0]'), WorldState.spheres[0].x, WorldState.spheres[0].y, WorldState.spheres[0].z)
}

function updateLights() {
    const renderLights = WorldState.lights.filter(light => light.enabled)
    const numLights = renderLights.length;
    gl.uniform1i(gl.getUniformLocation(program, 'numLights'), numLights)

    for (let i = 0; i < numLights; i++) {
        const light = renderLights[i];
        const posLoc = gl.getUniformLocation(program, 'lightPos[' + i + ']')
        const sizeLoc = gl.getUniformLocation(program, 'lightSize[' + i + ']')
        const colLoc = gl.getUniformLocation(program, 'lightIntensity[' + i + ']')
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
    gl.uniform2f(gl.getUniformLocation(program, 'attenuation'), quadraticAttenuation, linearAttenuation)
}

updateCamera()
updatePlanes()
updateSpheres()
updateLights()
updateRenderingSettings()


// ===== INPUT EVENT HANDLING =====
function logMovement(event) {
    if (mousePressed) {
        yaw -= event.movementX*0.002
        pitch -= event.movementY*0.002
    }
}
function handleKeys(event, down) {
    switch(event.code) {
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

document.addEventListener('mouseup', e => mousePressed = false)
document.addEventListener('mousedown', e => mousePressed = !e.target.closest('.controls')) // register mousepresses only if it occured outside of control panel
document.addEventListener('mousemove', logMovement)
document.addEventListener('keydown', e => handleKeys(e, true))
document.addEventListener('keyup', e => handleKeys(e, false))

// General rendering setting inputs
document.querySelectorAll('.shader-select').forEach(item => {
    item.addEventListener('input', event => {
        let newShaderSource
        if (event.target.id === "fast" && event.target.checked) {
            newShaderSource = document.querySelector("#fragment-shader-fast").text
        }
        else if (event.target.id === "quality" && event.target.checked) {
            newShaderSource = document.querySelector("#fragment-shader-quality").text
        }
        gl.deleteProgram(program)
        program = initializeProgram(gl, vertexShaderSource, newShaderSource)
        updateCamera()
        updatePlanes()
        updateSpheres()
        updateLights()
        updateRenderingSettings()
    })
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
document.getElementById('reflectionbounces').addEventListener('input', event => {
    reflectionBounces = event.target.value
    updateRenderingSettings()
})
document.getElementById('shadowsamples').addEventListener('input', event => {
    shadowSamples = event.target.value
    updateRenderingSettings()
})
document.getElementById('planebacksides').addEventListener('input', event => {
    enablePlaneBacksides = event.target.checked
    updateRenderingSettings()
})
document.getElementById('enablemirrorworld').addEventListener('input', event => {
    enablePlaneMirrors = event.target.checked
    updateRenderingSettings()
})
document.querySelectorAll('.attenuation').forEach(item => {
    item.addEventListener('input', event => {
        if (event.target.id === "quadratic")
            quadraticAttenuation = event.target.value
        else if (event.target.id === "linear")
            linearAttenuation = event.target.value
        updateRenderingSettings()
    })
})

// Plane inputs
document.querySelectorAll('.plane-enable').forEach(item => {
    item.addEventListener('input', event => {
        WorldState.planes[event.target.id].enabled = event.target.checked
        updatePlanes()
    })
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