const { mat4, mat3, vec3 } = glMatrix;

// ========== INITIALIZATION ==========

// --- Create WebGLRenderingContext ---
const canvas = document.querySelector("#c");
const gl = canvas.getContext("webgl2");

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      return shader;
    }
    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
}

console.log("COMPILING SHADERS")
const vertexShaderSource = document.querySelector("#vertex-shader").text;       // Get the shader code from inline HTML
const fragmentShaderSource = document.querySelector("#fragment-shader").text;
const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
console.log("CREATING PROGRAM")

function createProgram(gl, vertexShader, fragmentShader) {
    const GLprogram = gl.createProgram();
    gl.attachShader(GLprogram, vertexShader);
    gl.attachShader(GLprogram, fragmentShader);
    gl.linkProgram(GLprogram);
    if (gl.getProgramParameter(GLprogram, gl.LINK_STATUS)) {
      return GLprogram;
    }
    console.log(gl.getProgramInfoLog(GLprogram));
    gl.deleteProgram(GLprogram);
}
const program = createProgram(gl, vertexShader, fragmentShader);
console.log("FINISH")

// Variables to hold the state of the world
const numSpheres = WorldState.spheres.length
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
let keyDownW = false
let keyDownA = false
let keyDownS = false
let keyDownD = false
let enableAreaLights = true;
let lightPos = vec3.create()
let shadowDim = 3;
let xmove = 0
let moveinv = 1.0
let then = 0;

const fpsElem = document.getElementById('fps');
const enableGIbutton = document.getElementById('enableGI');
const enableRefGIbutton = document.getElementById('enableRefGI');
const indirectSamplesElem = document.getElementById('indirectsamples');
const shadowSamplesElem = document.getElementById('shadowsamples');
const reflectionBouncesElem = document.getElementById('reflectionbounces');
const planeBacksidesElem = document.getElementById('planebacksides');
const planeMirrorsElem = document.getElementById('enablemirrorworld');


// ========== RENDERING ==========
function drawScene(now) {
    now *= 0.001;
    const deltaTime = now - then;
    then = now;
    fpsElem.innerText = Math.floor(1.0/deltaTime);
    
    resize(gl);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);   // Tell WebGL how to convert from clip space to pixels
    gl.clearColor(0, 0, 0, 0);                              // Clear the canvas
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);                                 // Tell it to use our program (pair of shaders)

    // ----- Camera -----
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

    // ----- Set uniforms -----
    gl.uniform1f(gl.getUniformLocation(program, 'near'), near)
    gl.uniform1f(gl.getUniformLocation(program, 'far'), far)
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'invprojview'), false, inverseProjectionViewMatrix)
    gl.uniform3f(gl.getUniformLocation(program, 'ambientLight'), 0.01, 0.01, 0.01)
    gl.uniform2f(gl.getUniformLocation(program, 'attenuation'), WorldState.quadraticAttenuation, WorldState.linearAttenuation)
    gl.uniform1i(gl.getUniformLocation(program, 'numSpheres'), numSpheres)
    gl.uniform1i(gl.getUniformLocation(program, 'rayBounces'), reflectionBouncesElem.value)
    gl.uniform1i(gl.getUniformLocation(program, 'enableGI'), enableGIbutton.checked ? 1 : 0)
    gl.uniform1i(gl.getUniformLocation(program, 'enableRefGI'), enableRefGIbutton.checked ? 1 : 0)
    gl.uniform1i(gl.getUniformLocation(program, 'indirectSamples'), indirectSamplesElem.value)
    gl.uniform1i(gl.getUniformLocation(program, 'enablePlaneBacksides'), planeBacksidesElem.checked)
    gl.uniform1i(gl.getUniformLocation(program, 'enablePlaneMirrors'), planeMirrorsElem.checked)
    shadowDim = Math.floor(Math.sqrt(shadowSamplesElem.value))
    gl.uniform1f(gl.getUniformLocation(program, 'shadowDim'), shadowDim)
    gl.uniform1i(gl.getUniformLocation(program, 'shadowSamples'), Math.pow(shadowDim, 2)) // number of samples is forced to power of 2
    
    // Add lights
    const renderLights = WorldState.lights.filter(light => light.enabled)
    const numLights = renderLights.length;
    gl.uniform1i(gl.getUniformLocation(program, 'numLights'), numLights)

    for (let i = 0; i < numLights; i++) {
        const light = renderLights[i];
        if (light.rotate) {
            const lightRot = deltaTime * 0.5
            vec3.rotateY(lightPos, [light.x, light.y, light.z], [0,0,0], lightRot)
            light.x = lightPos[0];
            light.y = lightPos[1];
            light.z = lightPos[2];
        }
        posLoc = gl.getUniformLocation(program, 'lightPos[' + i + ']')
        sizeLoc = gl.getUniformLocation(program, 'lightSize[' + i + ']')
        colLoc = gl.getUniformLocation(program, 'lightIntensity[' + i + ']')
        spotLoc = gl.getUniformLocation(program, 'lightSpot[' + i + ']')
        gl.uniform3f(posLoc, light.x, light.y, light.z)
        gl.uniform2f(sizeLoc, enableAreaLights ? light.sizeX : 0, enableAreaLights ? light.sizeY : 0)
        gl.uniform3f(colLoc, light.r * light.brightness, light.g * light.brightness, light.b * light.brightness)
        gl.uniform2f(spotLoc, light.spotSize, light.spotIntensity)
    }

    // Add spheres
    if (xmove > 3.0) {
        xmove = 3.0
        moveinv = -1.0
    }
    else if (xmove < -3.0) {
        xmove = -3.0
        moveinv = 1.0
    }
    xmove += moveinv * deltaTime
    WorldState.spheres[0].x = xmove

    for (let i = 0; i < numSpheres; i++) {
        const sphere = WorldState.spheres[i];
        posLoc = gl.getUniformLocation(program, 'sphereCenters[' + i + ']')
        colLoc = gl.getUniformLocation(program, 'sphereColors[' + i + ']')
        refColLoc = gl.getUniformLocation(program, 'reflectiveColors[' + i + ']')
        gl.uniform3f(posLoc, sphere.x, sphere.y, sphere.z)
        gl.uniform3f(colLoc, sphere.r, sphere.g, sphere.b)
        gl.uniform3f(refColLoc, sphere.rr, sphere.rg, sphere.rb)
    }

    // Add planes
    let renderPlanes = []
    for (let i = 0; i < WorldState.planes.length; i++) {
        if (WorldState.planes[i].enabled) renderPlanes.push(WorldState.planes[i])
    }
    const numPlanes = renderPlanes.length;
    gl.uniform1i(gl.getUniformLocation(program, 'numPlanes'), numPlanes)
    for (let i = 0; i < numPlanes; i++) {
        offsetLoc = gl.getUniformLocation(program, 'planeOffsets[' + i + ']')
        normalLoc = gl.getUniformLocation(program, 'planeNormals[' + i + ']')
        colLoc = gl.getUniformLocation(program, 'planeColors[' + i + ']')
        gl.uniform1f(offsetLoc, renderPlanes[i].offset)
        gl.uniform3f(normalLoc, renderPlanes[i].x, renderPlanes[i].y, renderPlanes[i].z)
        gl.uniform3f(colLoc, renderPlanes[i].r, renderPlanes[i].g, renderPlanes[i].b)
    }

    // ----- Draw -----
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(drawScene);
}
// start loop
requestAnimationFrame(drawScene);

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

let mousePressed = false
document.addEventListener('mouseup', e => mousePressed = false)
document.addEventListener('mousedown', e => mousePressed = !e.target.closest('.controls')) // register mousepresses only if it occured outside of control panel
document.addEventListener('mousemove', logMovement)
document.addEventListener('keydown', e => handleKeys(e, true))
document.addEventListener('keyup', e => handleKeys(e, false))
document.getElementById('arealightsenable').addEventListener('change', e => enableAreaLights = !enableAreaLights);