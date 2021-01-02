attribute vec4 a_position;

varying vec3 vPosition;
            
void main() {
  gl_Position = a_position;
  vPosition = vec3(a_position.x*2.0, a_position.y, -6.5);
}