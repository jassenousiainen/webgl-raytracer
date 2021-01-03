uniform mat4 invprojview;
uniform float near;
uniform float far;

attribute vec4 a_position;

varying lowp vec3 origin;
varying lowp vec3 ray;
            
void main() {
  gl_Position = a_position;
  // https://stackoverflow.com/a/52764898
  origin = (invprojview * vec4(a_position.xy, -1.0, 1.0) * near).xyz;
  ray = (invprojview * vec4(a_position.xy * (far - near), far + near, far - near)).xyz;
}