const { mat4, mat3, vec3 } = glMatrix;

// ========== INITIALIZATION ==========

// --- Create WebGLRenderingContext ---
var canvas = document.querySelector("#c");
var gl = canvas.getContext("webgl");

function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
      return shader;
    }
    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
}

var vertexShaderSource = document.querySelector("#vertex-shader").text;
var fragmentShaderSource = document.querySelector("#fragment-shader").text;
var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

function createProgram(gl, vertexShader, fragmentShader) {
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
      return program;
    }
    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
}
var program = createProgram(gl, vertexShader, fragmentShader);

var positionAttributeLocation = gl.getAttribLocation(program, "a_position");    // look up where the vertex data needs to go.
var positionBuffer = gl.createBuffer();                                         // Create a buffer and put three 2d clip space points in it
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);                                 // Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)

var positions = [    // Full screen quad (two triangles that cover the screen)
    1.0, 1.0,
    -1.0, 1.0,
    1.0, -1.0,
    -1.0, -1.0
  ];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);


let xmove = 0
let moveinv = 1.0

let pointLights = []
//pointLights.push({x: 0, y: 4, z: 0, r: 1.0, g: 1.0, b: 1.0})
//pointLights.push({x: -1, y: 2.0, z: 1.0, r: 1.0, g: 1.0, b: 1.0})
const numPointLights = pointLights.length

let areaLights = []
areaLights.push({x: 0, y: 3.0, z: 0, sizeX: 0.5, sizeY: 0.5, r: 1.0, g: 1.0, b: 1.0})
areaLights.push({x: 0, y: 4.0, z: 0, sizeX: 0.5, sizeY: 0.5, r: 1.0, g: 1.0, b: 1.0})
const numAreaLights = areaLights.length

let spheres = [];
spheres.push({x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, rr: 1, rg: 1, rb: 1})
spheres.push({x: 1.25, y: 1.25, z: 1.25, r: 0, g: 1.0, b: 0, rr: 0, rg: 0, rb: 0})
spheres.push({x: -1.25, y: -1.25, z: 1.25, r: 0, g: 0, b: 0, rr: 0, rg: 1, rb: 1})
spheres.push({x: -1.25, y: 1.25, z: -1.25, r: 0, g: 0, b: 1.0, rr: 0, rg: 0, rb: 0})
spheres.push({x: 1.25, y: -1.25, z: -1.25, r: 0, g: 0, b: 0, rr: 1, rg: 0, rb: 1})
const numSpheres = spheres.length

let planes = []
planes.push({x: 0.0, y: 1.0, z: 0, r: 1.0, g: 1.0, b: 1.0, offset: -2})
planes.push({x: -1.0, y: 0.0, z: 0, r: 1.0, g: 0.5, b: 0.5, offset: 4.5})
planes.push({x: 1.0, y: 0.0, z: 0, r: 0.5, g: 1.0, b: 0.5, offset: -4.5})
planes.push({x: 0, y: 0, z: 1.0, r: 1.0, g: 1.0, b: 1.0, offset: -5.0})
const numPlanes = planes.length

let near = 0.1
let far = 4
let projectionMatrix = mat4.create()
let yaw = 0
let pitch = -0.2
let camX = 0
let camY = 3
let camZ = 12
let rotY = mat4.create()
let rotX = mat4.create()
let translationMatrix = mat4.create()
let viewMatrix = mat4.create()
let inverseProjectionViewMatrix = mat4.create()
let keyDownW = false
let keyDownA = false
let keyDownS = false
let keyDownD = false
let rayBounces = 4;

let lightRot = 0
let lightPos = vec3.create()

// ========== RENDERING ==========
requestAnimationFrame(drawScene);
function drawScene() {
    resize(gl);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);   // Tell WebGL how to convert from clip space to pixels
    gl.clearColor(0, 0, 0, 0);                              // Clear the canvas
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);                                 // Tell it to use our program (pair of shaders)

    gl.enableVertexAttribArray(positionAttributeLocation);                          // Turn on the attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);                                 // Bind the position buffer.
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);    // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)


    // Camera
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


    // Set uniforms
    gl.uniform1f(gl.getUniformLocation(program, 'near'), near)
    gl.uniform1f(gl.getUniformLocation(program, 'far'), far)
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'invprojview'), false, inverseProjectionViewMatrix)
    gl.uniform3f(gl.getUniformLocation(program, 'ambientLight'), 0.01, 0.01, 0.01)
    gl.uniform1i(gl.getUniformLocation(program, 'numPointLights'), numPointLights)
    gl.uniform1i(gl.getUniformLocation(program, 'numAreaLights'), numAreaLights)
    gl.uniform1i(gl.getUniformLocation(program, 'numSpheres'), numSpheres)
    gl.uniform1i(gl.getUniformLocation(program, 'numPlanes'), numPlanes)
    gl.uniform1i(gl.getUniformLocation(program, 'rayBounces'), rayBounces)

    shadowSamples = document.getElementById('shadowsamples').value;
    shadowDim = Math.floor(Math.sqrt(shadowSamples));
    shadowSamples = Math.pow(shadowDim, 2);
    gl.uniform1i(gl.getUniformLocation(program, 'shadowSamples'), shadowSamples)
    gl.uniform1f(gl.getUniformLocation(program, 'shadowDim'), shadowDim)
    
    lightRot += 0.005
    vec3.rotateY(lightPos, [-3,2,0], [0,0,0], lightRot)
    areaLights[0].x = lightPos[0];
    areaLights[0].y = lightPos[1];
    areaLights[0].z = lightPos[2];

    const cb = document.getElementById('light1');
    const light1red = document.getElementById('light1red').value / 100.0
    const light1green = document.getElementById('light1green').value / 100.0
    const light1blue = document.getElementById('light1blue').value / 100.0
    let light1col = cb.checked ? {r: light1red, g: light1green, b: light1blue} : {r: 0, g: 0, b: 0}
    areaLights[1] = {x: 0, y: 4, z: 0, sizeX: 0.5, sizeY: 0.5, ...light1col}

    for (let i = 0; i < numAreaLights; i++) {
        posLoc = gl.getUniformLocation(program, 'areaLightPos[' + i + ']')
        sizeLoc = gl.getUniformLocation(program, 'areaLightSize[' + i + ']')
        colLoc = gl.getUniformLocation(program, 'areaLightIntensity[' + i + ']')
        gl.uniform3f(posLoc, areaLights[i].x, areaLights[i].y, areaLights[i].z)
        gl.uniform2f(sizeLoc, areaLights[i].sizeX, areaLights[i].sizeY)
        gl.uniform3f(colLoc, areaLights[i].r, areaLights[i].g, areaLights[i].b)
    }

    for (let i = 0; i < numPointLights; i++) {
        posLoc = gl.getUniformLocation(program, 'pointLightPos[' + i + ']')
        colLoc = gl.getUniformLocation(program, 'pointLightIntensity[' + i + ']')
        gl.uniform3f(posLoc, pointLights[i].x, pointLights[i].y, pointLights[i].z)
        gl.uniform3f(colLoc, pointLights[i].r, pointLights[i].g, pointLights[i].b)
    }

    if (xmove > 3.0)
        moveinv = -1.0
    else if (xmove < -3.0)
        moveinv = 1.0
    xmove += 0.01 * moveinv
    spheres[0].x = xmove

    for (let i = 0; i < numSpheres; i++) {
        posLoc = gl.getUniformLocation(program, 'sphereCenters[' + i + ']')
        colLoc = gl.getUniformLocation(program, 'sphereColors[' + i + ']')
        refColLoc = gl.getUniformLocation(program, 'reflectiveColors[' + i + ']')
        gl.uniform3f(posLoc, spheres[i].x, spheres[i].y, spheres[i].z)
        gl.uniform3f(colLoc, spheres[i].r, spheres[i].g, spheres[i].b)
        gl.uniform3f(refColLoc, spheres[i].rr, spheres[i].rg, spheres[i].rb)
    }

    for (let i = 0; i < numPlanes; i++) {
        offsetLoc = gl.getUniformLocation(program, 'planeOffsets[' + i + ']')
        normalLoc = gl.getUniformLocation(program, 'planeNormals[' + i + ']')
        colLoc = gl.getUniformLocation(program, 'planeColors[' + i + ']')
        gl.uniform1f(offsetLoc, planes[i].offset)
        gl.uniform3f(normalLoc, planes[i].x, planes[i].y, planes[i].z)
        gl.uniform3f(colLoc, planes[i].r, planes[i].g, planes[i].b)
    }

    // draw
    var primitiveType = gl.TRIANGLE_STRIP;
    var offset = 0;
    var count = 4;
    gl.drawArrays(primitiveType, offset, count);

    requestAnimationFrame(drawScene);
}

// ===== EVENT HANDLING =====
let mousePressed = false
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
function mouseDown(event) {
    if (event.target.closest('.controls')) return;
    mousePressed = true;
}

document.addEventListener('mouseup', e => mousePressed = false)
document.addEventListener('mousedown', mouseDown)
document.addEventListener('mousemove', logMovement)
document.addEventListener('keydown', e => handleKeys(e, true))
document.addEventListener('keyup', e => handleKeys(e, false))