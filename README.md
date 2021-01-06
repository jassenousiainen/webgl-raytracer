# WebGL Raytracer
A simple realtime raytracer made with JavaScript and WebGL (GLSL). Requires browser with WebGL 1.0 support (developed and tested on Chrome v87) and a somewhat powerful GPU.

The ray tracing happens completely in the fragment shader, which is found in the file `fragment.glsl`. The vertex shader only calculates the origin and direction of the rays.
The contents of both of these shader files are then just copied to inline HTML.

## Features
- Fully realtime ray-traced, rasterization is only used for the full screen quad
- Intersection for sphere and plane primitives (and rectangles with currently only fixed direction)
- Supports point lights and rectangle area lights with customizable size
- Smooth shadows for area lights with customizable number of samples
- Global illumination with customizable number of samples
- Mirror reflections with customizable number of bounces (also GI in reflections)

I have made this application for the purpose of learning WebGL, so there might be multiple bugs and errors, and thus the code should not be used as a reference.
