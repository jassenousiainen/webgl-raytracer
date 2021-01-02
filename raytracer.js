// --- Create WebGLRenderingContext ---
var canvas = document.querySelector("#c");
var gl = canvas.getContext("webgl");


// ===== INITIALIZATION =====

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


// --- link those 2 shaders into a program ---
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

var positions = [    // Full screen quad
    1.0, 1.0,
    -1.0, 1.0,
    1.0, -1.0,
    -1.0, -1.0
  ];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);


// ===== RENDERING =====
xmove = -2.0
moveinv = 1.0

requestAnimationFrame(drawScene);
function drawScene() {
    if (xmove > 2.0)
        moveinv = -1.0
    else if (xmove < -2.0)
        moveinv = 1.0
    xmove += 0.01 * moveinv
    // Tell WebGL how to convert from clip space to pixels
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);      // Clear the canvas
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);         // Tell it to use our program (pair of shaders)

    gl.enableVertexAttribArray(positionAttributeLocation);                          // Turn on the attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);                                 // Bind the position buffer.
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);    // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)


    // Set uniforms
    gl.uniform3f(gl.getUniformLocation(program, 'ambientLight'), 0.05, 0.05, 0.05)

    let spheres = [];
    spheres.push({x: xmove, y: 0.0, z: 0.0, r: 1.0, g: 0.0, b: 0.0})
    spheres.push({x: 1, y: 1, z: 1, r: 0.0, g: 1.0, b: 0.0})
    spheres.push({x: -1, y: -1, z: 1, r: 0.0, g: 1.0, b: 1.0})
    spheres.push({x: -1, y: 1, z: -1, r: 0.0, g: 0.0, b: 1.0})
    spheres.push({x: 1, y: -1, z: -1, r: 1.0, g: 0.0, b: 1.0})
    for (let i = 0; i < spheres.length; i++) {
        posLoc = gl.getUniformLocation(program, 'sphereCenters[' + i + ']')
        colLoc = gl.getUniformLocation(program, 'sphereColors[' + i + ']')
        gl.uniform3f(posLoc, spheres[i].x, spheres[i].y, spheres[i].z)
        gl.uniform3f(colLoc, spheres[i].r, spheres[i].g, spheres[i].b)
    }

    let planes = []
    planes.push({x: 0, y: 1.0, z: 0, r: 1.0, g: 1.0, b: 1.0, offset: -1.8})
    for (let i = 0; i < planes.length; i++) {
        offsetLoc = gl.getUniformLocation(program, 'planeOffsets[' + i + ']')
        normalLoc = gl.getUniformLocation(program, 'planeNormals[' + i + ']')
        colLoc = gl.getUniformLocation(program, 'planeColors[' + i + ']')
        gl.uniform1f(offsetLoc, planes[i].offset)
        gl.uniform3f(normalLoc, planes[i].x, planes[i].y, planes[i].z)
        gl.uniform3f(colLoc, planes[i].r, planes[i].g, planes[i].b)
    }

    let lights = []
    lights.push({x: -2, y: 0.5, z: -2.5, r: 1.0, g: 1.0, b: 1.0})
    lights.push({x: 1, y: 1.5, z: -1.0, r: 1.0, g: 1.0, b: 1.0})
    for (let i = 0; i < lights.length; i++) {
        posLoc = gl.getUniformLocation(program, 'lightPosition[' + i + ']')
        colLoc = gl.getUniformLocation(program, 'lightIntensity[' + i + ']')
        gl.uniform3f(posLoc, lights[i].x, lights[i].y, lights[i].z)
        gl.uniform3f(colLoc, lights[i].r, lights[i].g, lights[i].b)
    }

    // draw
    var primitiveType = gl.TRIANGLE_STRIP;
    var offset = 0;
    var count = 4;
    gl.drawArrays(primitiveType, offset, count);

    requestAnimationFrame(drawScene);
}