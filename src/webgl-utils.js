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

export function initializeProgram(gl, vShader, fShader) {
    console.log("COMPILING SHADERS");
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vShader);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fShader);

    console.log("CREATING PROGRAM");
    resizeViewport(gl, 1280, 720);
    gl.clearColor(0, 0, 0, 0); // Clear the canvas
    gl.clear(gl.COLOR_BUFFER_BIT);
    const program = createProgram(gl, vertexShader, fragmentShader);
    gl.useProgram(program); // Tell it to use our program (pair of shaders)

    console.log("FINISH");
    return program;
}

export function createAndSetupTexture(gl) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

export function resizeViewport(gl, width, height) {
    gl.canvas.width = width;
    gl.canvas.height = height;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
}