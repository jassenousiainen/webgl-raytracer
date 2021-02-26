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

function initializeProgram(gl, vShader, fShader) {
    console.log("COMPILING SHADERS");
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vShader);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fShader);

    console.log("CREATING PROGRAM");
    resize(gl);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);   // Tell WebGL how to convert from clip space to pixels
    gl.clearColor(0, 0, 0, 0);                              // Clear the canvas
    gl.clear(gl.COLOR_BUFFER_BIT);
    const program = createProgram(gl, vertexShader, fragmentShader);
    gl.useProgram(program); // Tell it to use our program (pair of shaders)

    console.log("FINISH");
    return program;
}

// https://webglfundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html
function resize(gl) {
    var realToCSSPixels = window.devicePixelRatio;
  
    // Lookup the size the browser is displaying the canvas in CSS pixels
    // and compute a size needed to make our drawingbuffer match it in
    // device pixels.
    var displayWidth  = Math.floor(gl.canvas.clientWidth  * realToCSSPixels);
    var displayHeight = Math.floor(gl.canvas.clientHeight * realToCSSPixels);
  
    // Check if the canvas is not the same size.
    if (gl.canvas.width  !== displayWidth ||
        gl.canvas.height !== displayHeight) {
  
        // Make the canvas the same size
        gl.canvas.width  = displayWidth;
        gl.canvas.height = displayHeight;
    }
  }