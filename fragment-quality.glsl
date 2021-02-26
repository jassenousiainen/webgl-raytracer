#version 300 es
precision mediump float;

#define MAX_LIGHTS 2
#define MAX_SPHERES 5
#define MAX_PLANES 6
#define MAX_SHADOW_SAMPLES 49
#define MAX_RAYBOUNCES 5
#define MAX_GISAMPLES 100

#define specular_exponent 32.0
#define EPSILON 0.001
#define PI 3.141593

const mat3 ACESInputMat = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777);
const mat3 ACESOutputMat = mat3(
    1.60475, -0.10208, -0.00327,
    -0.53108,  1.10813, -0.07276,
    -0.07367, -0.00605,  1.07602);

float randomIncrement;
uniform float randomseed;
uniform int numLights;
uniform vec3 lightPos[MAX_LIGHTS];
uniform vec2 lightSize[MAX_LIGHTS];
uniform vec3 lightIntensity[MAX_LIGHTS];
uniform vec2 lightSpot[MAX_LIGHTS];
uniform int shadowSamples;
uniform float shadowDim;
uniform vec2 attenuation;

uniform int numSpheres;
uniform vec3 sphereCenters[MAX_SPHERES];
uniform vec3 sphereColors[MAX_SPHERES];
uniform vec3 reflectiveColors[MAX_SPHERES];

uniform int numPlanes;
uniform float planeOffsets[MAX_PLANES];
uniform vec3 planeNormals[MAX_PLANES];
uniform vec3 planeColors[MAX_PLANES];

uniform int rayBounces;
uniform vec3 ambientLight;
uniform bool enableGI;
uniform bool enableRefGI;
uniform int indirectSamples;
uniform bool enablePlaneBacksides;
uniform bool enablePlaneMirrors;

in lowp vec3 origin;
in lowp vec3 ray;
out vec4 fragColor;


// https://stackoverflow.com/a/10625698
float random( vec2 p ) {
    vec2 K1 = vec2(
        23.14069263277926, // e^pi (Gelfond's constant)
         2.665144142690225 // 2^sqrt(2) (Gelfondâ€“Schneider constant)
    );
    randomIncrement += 0.02; // increment, so that each access gets different value
    return fract( cos( dot(p+randomIncrement,K1) ) * 12345.6789 );
}

bool intersectSphere(vec3 ray_origin, vec3 ray_direction, vec3 center, float radius, float tmin, inout float t_hit) {
    float radius_sqr = radius*radius;
    vec3 vec_to_orig = center - ray_origin; 

    float t_closest = dot(vec_to_orig , ray_direction); // t at the closest to the sphere's center
    if (t_closest < 0.0) // If negative, the ray and sphere are on other sides of the origin
        return false; 

    float dist_to_center2 = dot(vec_to_orig, vec_to_orig) - t_closest * t_closest;
    if (dist_to_center2 > radius_sqr) // If the smallest distance^2 from the ray to center is larger that radius^2, the ray doesn't intersect
        return false; 

    float dist_mid_to_surface = sqrt(radius_sqr - dist_to_center2); 
    float t_surface1 = t_closest - dist_mid_to_surface; // t values at surfaces on both sides
    float t_surface2 = t_closest + dist_mid_to_surface;

    float t = (t_surface1 < tmin) ? t_surface2 : t_surface1;
    if (t < t_hit && t > tmin) {
        t_hit = t;
        return true;
    }
    return false;
}

bool intersectPlane(vec3 ray_origin, vec3 ray_direction, float offset, vec3 normal, vec3 center, vec2 size, float tmin, inout float t_hit) {
    vec3 normal_offset = normal * offset;
    float d = normal_offset.x + normal_offset.y + normal_offset.z;
    float t = (d - dot(normal, ray_origin)) / dot(normal, ray_direction);
    
    if (t < t_hit && t > tmin) {
        vec3 tmpPos = ray_origin + ray_direction * t;
        if (length(size) == 0.0 || (
            tmpPos.x < center.x + size.x*0.5 &&
            tmpPos.x > center.x - size.x*0.5 &&
            tmpPos.z < center.z + size.y*0.5 &&
            tmpPos.z > center.z - size.y*0.5)) {
            t_hit = t;
            return true;
        }
    }
    return false;
}

// Intersects with all of the objects in the world and returns closest hit (note the use of "out" arguments)
bool intersect(vec3 ray_origin,
            vec3 ray_direction,
            inout float t_hit,
            float tmin,
            out vec3 position,
            out vec3 normal,
            inout vec3 diffuseColor,
            inout vec3 specularColor,
            inout vec3 reflectiveColor,
            inout bool isLight)
{
    int intersected = 0;
    int idx = 0;
    
    // Intersect spheres
    for (int i = 0; i < MAX_SPHERES; i++) {
        if (i >= numSpheres) break;
        if (intersectSphere(ray_origin, ray_direction, sphereCenters[i], 0.8, tmin, t_hit)) {
            idx = i;
            intersected = 1;
        }
    }

    // Intersect planes
    for (int i = 0; i < MAX_PLANES; i++) {
        if (i >= numPlanes) break;
        vec3 planeNormal = planeNormals[i];
        bool tmp = false;
        if (enablePlaneBacksides || dot(ray_direction, planeNormal) < 0.0)
            tmp = intersectPlane(ray_origin, ray_direction, planeOffsets[i], planeNormal, vec3(0,0,0), vec2(0,0), tmin, t_hit);
        if (tmp) {
            normal = planeNormal;
            idx = i;
            intersected = 2;
        }
    }

    // Intersect lights to make them visible
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= numLights) break;
        vec3 center = lightPos[i];
        vec2 size = lightSize[i];
        bool tmp = false;
        if (size.x > 0.0 && size.y > 0.0)
            tmp = intersectPlane(ray_origin, ray_direction, center.y, vec3(0,1,0), center, size, tmin, t_hit);
        else
            tmp = intersectSphere(ray_origin, ray_direction, center, 0.1, tmin, t_hit);
        if (tmp) {
            idx = i;
            intersected = 3;
        }
    }

    position = ray_origin + ray_direction * t_hit;

    // Make only one color lookup for each intersection
    if (intersected == 1) {
        diffuseColor = sphereColors[idx];
        specularColor = vec3(1.0, 1.0, 1.0);
        reflectiveColor = reflectiveColors[idx];
        normal = normalize(position - sphereCenters[idx]);
        if (dot(normal, -ray_direction) < 0.0) // Backside shading: flip normal if ray and normal are on different sides
            normal *= -1.0;
    }
    else if (intersected == 2) {
        if (enablePlaneMirrors) {
            diffuseColor = planeColors[idx]*0.01;
            specularColor = vec3(0, 0, 0);
            reflectiveColor = planeColors[idx];
        } else {
            diffuseColor = planeColors[idx];
            specularColor = vec3(0.5, 0.5, 0.5);
            reflectiveColor = vec3(0, 0, 0);
        }
        if (dot(normal, -ray_direction) < 0.0) // Backside shading: flip normal if ray and normal are on different sides
            normal *= -1.0;
    }
    else if (intersected == 3) {
        diffuseColor = lightIntensity[idx]/25.0;
        isLight = true;
    }

    return intersected != 0;
}

// Faster intersect function for shadows
bool intersectShadowRay(vec3 ray_origin, vec3 ray_direction, inout float t_hit, float tmin) {
    for (int i = 0; i < MAX_SPHERES; i++) {
        if (i == numSpheres) break;
        if (intersectSphere(ray_origin, ray_direction, sphereCenters[i], 0.8, tmin, t_hit))
            return true;
    }
    for (int i = 0; i < MAX_PLANES; i++) {
        if (i == numPlanes) break;
        if (intersectPlane(ray_origin, ray_direction, planeOffsets[i], planeNormals[i], vec3(0,0,0), vec2(0,0), tmin, t_hit))
            return true;
    }
    return false;
}

void getIncidentIntensity(float sample_i, vec3 p, vec3 position, vec3 intensity, vec2 size, vec2 spot, out float light_distance, out vec3 vec_to_light, out vec3 incident_intensity) {
    if (size.x > 0.0 && size.y > 0.0) {
        // Get jittered position on the light plane
        float inv_dim = 1.0 / shadowDim;
        float cell_sizeX = size.x * inv_dim;
        float cell_sizeY = size.y * inv_dim;
        float posX = cell_sizeX * (mod(sample_i, shadowDim) + random(p.xy));
        float posY = cell_sizeY * (floor(sample_i * inv_dim) + random(p.yx));
        float x = position.x - size.x*0.5 + posX;
        float z = position.z - size.y*0.5 + posY;
        vec_to_light = vec3(x, position.y, z) - p;
    } else {
        vec_to_light = position - p; // point light
    }

    light_distance = length(vec_to_light);
    float attenuation = 1.0 / (attenuation.x*pow(light_distance, 2.0) + attenuation.y*light_distance);
    vec_to_light = normalize(vec_to_light);

    // Spotlight effect
    // spot.x is the size of the spot and spot.y is the exponent to produce smooth falloff
    float spot_falloff = 1.0;
    if (spot.x > 0.0) {
        float dot_to_light = dot(vec_to_light, vec3(0.0, 1.0, 0.0));
        spot_falloff = (dot_to_light > spot.x) ? pow(dot_to_light, spot.y) : 0.0;
    }

    incident_intensity = intensity * attenuation * spot_falloff;
}

vec3 shadePhong(vec3 ray_direction, vec3 normal, vec3 dir_to_light, vec3 incident_intensity, vec3 diffuse_color, vec3 specular_color) {        
    if (dot(normal, dir_to_light) > 0.0) {                                                  // Only add light if light is on the same side as normal
        float light_incident = max(0.0, dot(normal, dir_to_light));                         // Brightness depends on the angle between light and normal
        vec3 diffuse = diffuse_color*light_incident;
        
        vec3 vect_reflection = -dir_to_light - 2.0 * dot(-dir_to_light, normal) * normal;	// Reflection vector pointing away from object
        vec3 vect_camera = -ray_direction;													// Vector pointing from object to camera
        float reflection_intensity = pow(max(0.0, dot(vect_reflection, vect_camera)), specular_exponent);// How closely the reflection vector points to the camera = intensity
        vec3 specular = specular_color * reflection_intensity;

        return incident_intensity * (diffuse + specular);
    }

    return vec3(0, 0, 0);
}

// Calculates and returns specular and diffuse illumination from all lights on a given point
vec3 illumination(vec3 point, vec3 ray_dir, vec3 normal, vec3 diffuseColor, vec3 specularColor) {
    vec3 illuminationColor;

    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i == numLights) break;
        vec3 lightPos = lightPos[i];
        vec3 lightIntensity = lightIntensity[i];
        vec2 lightSize = lightSize[i];
        vec2 lightSpot = lightSpot[i];
        vec3 light_sum;
        int areaShadowSamples = (lightSize.x > 0.0 && lightSize.y > 0.0) ? shadowSamples : 1;

        for (int k = 0; k < MAX_SHADOW_SAMPLES; k++) {
            if (k == areaShadowSamples) break;
            vec3 incident_intensity, dir_to_light;
            float light_distance;
            getIncidentIntensity(float(k), point, lightPos, lightIntensity, lightSize, lightSpot, light_distance, dir_to_light, incident_intensity);
            
            if (length(incident_intensity) > 0.01) { // If there is no light at this point (distance or outside of spotlight) do not check for shadows
                float t_shadowHit = light_distance;
                intersectShadowRay(point, dir_to_light, t_shadowHit, 0.01);
                if (abs(t_shadowHit - light_distance) < EPSILON) {
                    light_sum += shadePhong(ray_dir, normal, dir_to_light, incident_intensity, diffuseColor, specularColor);
                }
            }
        }

        illuminationColor += light_sum / float(areaShadowSamples);
    }
    return illuminationColor;
}

// Calculates and returns indirect illumination on a given point
// uses only one bounce because of exponential performance hit
vec3 indirectIllumination(vec3 point, vec3 normal, vec3 diffuseColor) {
    if (length(diffuseColor) == 0.0) return vec3(0,0,0); // don't do unneeded calculations if the surface doesn't have a diffuse color

    mat3 transform;
    if (abs(normal.x) > abs(normal.y))
        transform[2] = vec3(normal.z, 0, -normal.x) / sqrt(normal.x * normal.x + normal.z * normal.z);
    else
        transform[2] = vec3(0, -normal.z, normal.y) / sqrt(normal.y * normal.y + normal.z * normal.z);
    transform[0] = cross(normal, transform[2]);
    transform[1] = normal;

    // Sample rays uniformly over hemisphere with spherical coordinates
    vec3 indirect_sampling_sum;
    for (int k = 0; k < MAX_GISAMPLES; k++) {
        if (k >= indirectSamples) break;
        float z = random(point.xy);
        float radius = sqrt(1.0 - z * z);						    // uniform radius on hemisphere
        float theta = 2.0 * PI * random(point.yx);	                // uniform angle on [0, 2*pi]
        vec3 coords = vec3(cos(theta)*radius, z, sin(theta)*radius);// get cartesian coordinates

        // Transform point to world space
        vec3 indirectDir = transform * coords;
        float t_indirectHit = 10.0;
        vec3 indirectHitPoint, indirectDiffuseColor, indirectSpecularColor, indirectReflectiveColor, indirectNormal;
        bool isLight = false;

        // Intersect this bounced ray (lights are considered black, because their illumination is already taken into account) and get direct illumination from this point
        intersect(point, indirectDir, t_indirectHit, 0.01, indirectHitPoint, indirectNormal, indirectDiffuseColor, indirectSpecularColor, indirectReflectiveColor, isLight);
        indirect_sampling_sum += isLight ? vec3(0,0,0) : z * illumination(indirectHitPoint, indirectDir, indirectNormal, indirectDiffuseColor, indirectSpecularColor);
    }
    // Return the scaled indirect light
    return ((2.0 * indirect_sampling_sum / float(indirectSamples)) * diffuseColor);
}

// Calculates and returns mirror reflections on a given point
vec3 reflectionIllumination(vec3 origin, vec3 rayDir, vec3 normal, vec3 reflectiveColor) {
    vec3 reflectionSum, mirrorDir;
    for (int i = 0; i < MAX_RAYBOUNCES; i++) {
        if (i >= rayBounces || length(reflectiveColor) == 0.0) break; // Stop if we reach max number of bounces or hit material that is not reflective

        // Trace the mirror ray and add the result to pixel
        mirrorDir = vec3(rayDir - 2.0 * dot(rayDir, normal) * normal); // Get the direction of the reflected ray
        float t_bounceHit = 50.0;
        bool isLight = false;
        vec3 bounceDiffuseColor, bounceSpecularColor, bounceReflectiveColor, bounceHitPoint;
        intersect(origin, mirrorDir, t_bounceHit, 0.01, bounceHitPoint, normal, bounceDiffuseColor, bounceSpecularColor, bounceReflectiveColor, isLight);
        
        vec3 mirror_sample_color = isLight ? bounceDiffuseColor : illumination(bounceHitPoint, mirrorDir, normal, bounceDiffuseColor, bounceSpecularColor);
        
        if (enableRefGI) // Add indirect illumination to reflection
            mirror_sample_color += indirectIllumination(bounceHitPoint, normal, bounceDiffuseColor);
        else
            mirror_sample_color += ambientLight * bounceDiffuseColor;

        reflectionSum += mirror_sample_color * reflectiveColor;
        origin = bounceHitPoint;
        rayDir = mirrorDir;
        reflectiveColor = bounceReflectiveColor * reflectiveColor;  // Successive ray colors are affected by each reflective surface's color
    }
    return reflectionSum;
}


void main() {
    vec3 ray_dir = normalize(ray);
    float t_hit = length(ray); // The far clipping distance
    vec3 pixelColor, diffuseColor, specularColor, reflectiveColor, normal, point;
    bool isLight = false;
    randomIncrement = randomseed;

    // intersect the ray with objects (tmin is 0, because vertex shader places the origin in near clipping distance)
    intersect(origin, ray_dir, t_hit, 0.0, point, normal, diffuseColor, specularColor, reflectiveColor, isLight);

    if (isLight) {  // If the ray hit a light, return its color because it doesn't have any other properties than surface color
        fragColor = vec4(diffuseColor, 1.0);
        return;
    }

    // Ambient light
    if (!enableGI)
        pixelColor += ambientLight * diffuseColor;

    // ==== DIRECT ILLUMINATION ====
    pixelColor += illumination(point, ray_dir, normal, diffuseColor, specularColor);

    // ==== INDIRECT ILLUMINATION ====
    if (enableGI)
        pixelColor += indirectIllumination(point, normal, diffuseColor);

    // ==== MIRROR REFLECTION ====
    if (rayBounces > 0 && length(reflectiveColor) > 0.0)
        pixelColor += reflectionIllumination(point, ray_dir, normal, reflectiveColor);

    
    // ACES tonemapping (source: https://github.com/TheRealMJP/BakingLab/blob/master/BakingLab/ACES.hlsl)
    pixelColor = ACESInputMat * pixelColor;

    vec3 a = pixelColor * (pixelColor + 0.0245786) - 0.000090537;
    vec3 b = pixelColor * (0.983729 * pixelColor + 0.4329510) + 0.238081;
    pixelColor = a / b;

    pixelColor = ACESOutputMat * pixelColor;
    pixelColor = clamp(pixelColor, 0.0, 1.0);
                
    fragColor = vec4(pow(pixelColor, vec3(0.45)), 1.0);
}