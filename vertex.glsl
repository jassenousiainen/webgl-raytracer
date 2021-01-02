attribute vec4 a_position;

varying vec3 vPosition;

const vec2 scale = vec2(0.5, 0.5);

void main() {
  gl_Position = a_position;
  vPosition = vec3(a_position.xy * scale + scale, -6.5);
}