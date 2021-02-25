# WebGL Raytracer
A simple realtime raytracer made with JavaScript and WebGL. Requires browser with WebGL 2.0 support (developed and tested on Chrome v87) and a somewhat powerful GPU.

View demo in here: https://jassenousiainen.github.io/

The ray tracing happens completely in the fragment shader, which is found in the file `fragment.glsl`. The vertex shader only calculates the origin and direction of the rays.
The contents of both of these shader files are then just copied to inline HTML.
The program uses no vertex buffers, instead it uses the indices of the three vertices of the fullscreen triangle.

## Features
- Fully realtime ray-traced, rasterization is only used for the full screen triangle
- Intersection for sphere and plane primitives (and rectangles with currently only fixed direction)
- Phong shading model for diffuse and specular illumination
- Supports point lights and rectangle area lights with customizable size
- Smooth shadows for area lights with customizable number of samples
- Global illumination with customizable number of samples
- Mirror reflections with customizable number of bounces (also GI in reflections)
- Free-fly perspective camera, use WASD -keys to move and mouse while holding left mouse button to look around
- ACES tonemapping

Note that I have made this application just for the purpose of learning WebGL, so there might be multiple bugs and errors.

## Screenshots
![screen1](/screenshots/screenshot1.png?raw=true)
![screen2](/screenshots/screenshot2.png?raw=true)
![screen3](/screenshots/screenshot3.png?raw=true)