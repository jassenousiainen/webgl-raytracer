#version 300 es
precision highp float;
uniform mat4 invprojview;
uniform float near;
uniform float far;

out vec3 origin;
out vec3 ray;
out vec2 texCoord;

void main() {
    // https://rauwendaal.net/2014/06/14/rendering-a-screen-covering-triangle-in-opengl/
    float x = -1.0 + float((gl_VertexID & 1) << 2);
    float y = -1.0 + float((gl_VertexID & 2) << 1);
    texCoord.x = (x+1.0)*0.5;
    texCoord.y = (y+1.0)*0.5;
    gl_Position = vec4(x, y, 0, 1);
                
    // https://stackoverflow.com/a/52764898
    origin = (invprojview * vec4(x, y, -1.0, 1.0) * near).xyz;
    ray = (invprojview * vec4(vec2(x,y) * (far - near), far + near, far - near)).xyz;
}