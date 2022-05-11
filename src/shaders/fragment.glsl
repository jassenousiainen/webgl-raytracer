#version 300 es
precision highp float;
precision highp sampler2D;

#define MAX_LIGHTS 2
#define MAX_SPHERES 4
#define MAX_PLANES 6

#define specular_exponent 128.0
#define EPSILON 0.001
#define PI 3.141593
#define PI2 6.283185
#define PHI 2.399963 // golden angle in radians

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
uniform vec3 lightBrightness[MAX_LIGHTS];
uniform vec2 lightSpot[MAX_LIGHTS];
uniform int shadowSamples;
uniform float shadowDim;
uniform vec2 attenuationFactor;

uniform int numSpheres;
uniform vec3 sphereCenters[MAX_SPHERES];
uniform vec3 sphereColors[MAX_SPHERES];
uniform vec3 reflectiveColors[MAX_SPHERES];
uniform vec3 sphereSpecColors[MAX_SPHERES];
uniform float sphereRoughness[MAX_SPHERES];

uniform int numPlanes;
uniform float planeOffsets[MAX_PLANES];
uniform vec3 planeNormals[MAX_PLANES];
uniform vec3 planeColors[MAX_PLANES];
uniform float planeSpecular[MAX_PLANES];
uniform float planeRoughness[MAX_PLANES];

uniform int rayBounces;
uniform vec3 ambientLight;
uniform bool enableGI;
uniform bool enableRefGI;
uniform int indirectSamples;
uniform float rcp_indirectSamples;
uniform float indirectJitterScale;
uniform bool enablePlaneBacksides;
uniform bool enablePlaneMirrors;
uniform bool enableTAA;
uniform float u_taaBlendFactor;

uniform sampler2D u_texture;

in vec3 origin;
in vec3 ray;
in vec2 texCoord;

out vec4 fragColor;


/* ==== HELPER FUNCTIONS ==== */
// https://stackoverflow.com/a/10625698
float random( vec2 p ) {
    vec2 K1 = vec2(
        23.14069263277926, // e^pi (Gelfond's constant)
         2.665144142690225 // 2^sqrt(2) (Gelfondâ€“Schneider constant)
    );
    randomIncrement += 0.02; // increment, so that each access gets different value
    return fract( cos( dot(p+randomIncrement,K1) ) * 12345.6789 );
}

float square(float x) { return x * x; }

//https://github.com/NVIDIA/Q2RTX/blob/master/src/refresh/vkpt/shader/utils.glsl
mat3 construct_ONB_frisvad(vec3 normal) {
    mat3 ret;
    ret[1] = normal;
    if(normal.z < -0.999805696) {
        ret[0] = vec3(0.0, -1.0, 0.0);
        ret[2] = vec3(-1.0, 0.0, 0.0);
    }
    else {
        float a = 1.0 / (1.0 + normal.z);
        float b = -normal.x * normal.y * a;
        ret[0] = vec3(1.0 - normal.x * normal.x * a, b, -normal.x);
        ret[2] = vec3(b, 1.0 - normal.y * normal.y * a, -normal.y);
    }
    return ret;
}

vec3 LessThan(vec3 f, float value) {
    return vec3(
        (f.x < value) ? 1.0 : 0.0,
        (f.y < value) ? 1.0 : 0.0,
        (f.z < value) ? 1.0 : 0.0);
}
/* =============== */


bool intersectSphere(vec3 ray_origin, vec3 ray_direction, vec3 center, float radius, float tmin, inout float t_hit) {
    vec3 vec_to_orig = center - ray_origin; 

    float t_closest = dot(vec_to_orig , ray_direction); // t at the closest to the sphere's center
    if (t_closest < 0.0) // If negative, the ray and sphere are on other sides of the origin
        return false; 

    float dist_to_center2 = dot(vec_to_orig, vec_to_orig) - t_closest * t_closest;
    float radius_sqr = radius*radius;
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
        if (size.x + size.y == 0.0 || (
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
            inout float roughness,
            inout bool intersectLight)
{
    int intersected = 0;
    int idx = 0;
    
    // Intersect spheres
    for (int i = 0; i < numSpheres; i++) {
        if (intersectSphere(ray_origin, ray_direction, sphereCenters[i], 0.8, tmin, t_hit)) {
            idx = i;
            intersected = 1;
        }
    }

    // Intersect planes
    for (int i = 0; i < numPlanes; i++) {
        vec3 planeNormal = planeNormals[i];
        if (enablePlaneBacksides || dot(ray_direction, planeNormal) < 0.0) {
            if (intersectPlane(ray_origin, ray_direction, planeOffsets[i], planeNormal, vec3(0,0,0), vec2(0,0), tmin, t_hit)) {
                normal = planeNormal;
                idx = i;
                intersected = 2;
            }
        }
    }

    // Intersect lights to make them visible
    if (intersectLight) {
        intersectLight = false;
        for (int i = 0; i < numLights; i++) {
            vec3 center = lightPos[i];
            vec2 size = lightSize[i];
            bool tmp = false;
            if (size.x > 0.0 && size.y > 0.0) // area light
                tmp = intersectPlane(ray_origin, ray_direction, center.y, vec3(0.0,1.0,0.0), center, size, tmin, t_hit);
            else // point light
                tmp = intersectSphere(ray_origin, ray_direction, center, 0.1, tmin, t_hit);
            if (tmp) {
                idx = i;
                intersected = 3;
            }
        }
    }

    position = ray_origin + ray_direction * t_hit;

    // Make only one set of color lookups for each intersection
    if (intersected == 1) { // Sphere
        diffuseColor = sphereColors[idx];
        specularColor = sphereSpecColors[idx];
        reflectiveColor = reflectiveColors[idx];
        roughness = sphereRoughness[idx];
        normal = normalize(position - sphereCenters[idx]);
        if (dot(normal, -ray_direction) < 0.0) // Backside shading: flip normal if ray and normal are on different sides
            normal *= -1.0;
    }
    else if (intersected == 2) { // Plane
        if (!enablePlaneMirrors) {
            diffuseColor = planeColors[idx];
            specularColor = planeSpecular[idx] * vec3(1.0, 1.0, 1.0);
            reflectiveColor = vec3(0.0);
            roughness = planeRoughness[idx];
        } else {
            diffuseColor = planeColors[idx]*0.01;
            specularColor = vec3(0.0);
            reflectiveColor = planeColors[idx];
            roughness = 1.0;
        }
        if (dot(normal, -ray_direction) < 0.0)
            normal *= -1.0;
    }
    else if (intersected == 3) { // Light
        float spot_falloff = 1.0;
        vec2 spot = lightSpot[idx];
        if (spot.x > 0.0) {
            float dot_to_light = dot(ray_direction, vec3(0.0, 1.0, 0.0));
            spot_falloff = (dot_to_light > spot.x) ? pow(dot_to_light, spot.y) : 0.0;
        }
        diffuseColor = spot_falloff * lightBrightness[idx] * 0.2;
        intersectLight = true;
    }

    return intersected != 0;
}

// Faster intersect function for shadows
bool intersectShadowRay(vec3 ray_origin, vec3 ray_direction, inout float t_hit) {
    for (int i = 0; i < numSpheres; i++)
        if (intersectSphere(ray_origin, ray_direction, sphereCenters[i], 0.8, EPSILON, t_hit))
            return true;
    for (int i = 0; i < numPlanes; i++)
        if (intersectPlane(ray_origin, ray_direction, planeOffsets[i], planeNormals[i], vec3(0.0), vec2(0.0), EPSILON, t_hit))
            return true;
    return false;
}

void getIncidentIntensity(float sample_i, vec3 P, vec3 lightPos, vec3 intensity, vec2 size, vec2 spot, bool isAreaLight, out float L_dist, out vec3 L, out vec3 incidentIntensity) {
    if (isAreaLight) { // Get jittered position on the light plane
        float inv_dim = 1.0 / shadowDim;
        float cell_sizeX = size.x * inv_dim;
        float cell_sizeY = size.y * inv_dim;
        float posX = cell_sizeX * (mod(sample_i, shadowDim) + random(P.xz*P.y));
        float posY = cell_sizeY * (floor(sample_i * inv_dim) + random(P.yx*P.z));
        float x = lightPos.x - size.x*0.5 + posX;
        float z = lightPos.z - size.y*0.5 + posY;
        L = vec3(x, lightPos.y, z) - P;
    } else { // point light
        L = lightPos - P; 
    }

    L_dist = length(L);
    float attenuation = 1.0 / (attenuationFactor.x*square(L_dist) + attenuationFactor.y*L_dist);
    L = normalize(L);

    // Spotlight effect
    // spot.x is the size of the spot and spot.y is the exponent to produce smooth falloff
    float falloff = 1.0;
    if (spot.x > 0.0) {
        float dot_to_light = dot(L, vec3(0.0, 1.0, 0.0));
        falloff = (dot_to_light > spot.x) ? pow(dot_to_light, spot.y) : 0.0;
    }

    incidentIntensity = intensity * attenuation * falloff;
}

/** 
* Phong shading 
*   - does not take into account if light and normal are on the same side or not
*
*   V:    View vector towards surface
*   N:    Normal of surface
*   L:    Vector towards light from surface
*/
vec3 shadePhong(vec3 V, vec3 N, vec3 L, vec3 diffuseColor, vec3 specularColor) {
    vec3 diffuse = diffuseColor * dot(N, L); // Diffuse brightness depends on the angle between light and normal
        
    vec3 R = reflect(-L, N); // Reflection vector pointing away from object
    float reflection_intensity = pow(max(0.0, dot(R, -V)), specular_exponent); // Specular intensity depends on how closely the reflection vector points to the camera
    vec3 specular = specularColor * reflection_intensity;

    return diffuse + specular;
}

// Calculates and returns specular and diffuse illumination from all lights on a given point
vec3 directIllumination(vec3 P, vec3 V, vec3 N, vec3 diffuseColor, vec3 specularColor, bool useSampling) {
    vec3 illuminationColor;

    for (int i = 0; i < numLights; i++) {
        vec3 lightPos = lightPos[i];
        vec3 lightBrightness = lightBrightness[i];
        vec2 lightSize = lightSize[i];
        vec2 lightSpot = lightSpot[i];
        vec3 light_sum, incidentIntensity, L;
        float L_dist;
        bool isAreaLight = useSampling && lightSize.x > 0.0 && lightSize.y > 0.0;
        int testSamples = isAreaLight ? 5 : 1; // use one sample if calculating pointlights
        int areaShadowSamples = 0;
        bool inLight, inShade = false;

        // Get 5 test points to the light (4 corners, 1 center)
        for (int k = 0; k < testSamples; k++) {
            if (inLight && inShade) break; // best-case-scenaraio: stop after two test samples

            vec3 testPos = lightPos;
            if (k == 1) { // up left
                testPos.x -= lightSize.x*0.5;
                testPos.z -= lightSize.y*0.5;
            }
            else if (k == 2) { // bottom right
                testPos.x += lightSize.x*0.5;
                testPos.z += lightSize.y*0.5;
            }
            else if (k == 3) { // up right
                testPos.x += lightSize.x*0.5;
                testPos.z -= lightSize.y*0.5;
            }
            else if (k == 4) { // bottom left
                testPos.x -= lightSize.x*0.5;
                testPos.z += lightSize.y*0.5;
            }

            getIncidentIntensity(float(k), P, testPos, lightBrightness, lightSize, lightSpot, false, L_dist, L, incidentIntensity);

            if (dot(N, L) > 0.0 && incidentIntensity.r + incidentIntensity.g + incidentIntensity.b > 0.01) { // If no light falls to this point, do not check for shadows
                float t_shadowHit = L_dist;
                intersectShadowRay(P, L, t_shadowHit);
                if (abs(t_shadowHit - L_dist) < EPSILON) {
                    light_sum += incidentIntensity * shadePhong(V, N, L, diffuseColor, specularColor);
                    inLight = true;
                } else {
                    inShade = true; // in shadow of object
                }
            } else {
                inShade = true;
            }

            areaShadowSamples++;
        }

        // If after 5 test samples there is atleast one ray that doesn't reach light and one that reaches the light, the point should have more accurate shading (shadow edges)
        if (isAreaLight && inLight && inShade) {
            areaShadowSamples = shadowSamples;
            light_sum = vec3(0.0); // Start the sampling over, because keeping the results of regular sampling would produce banding
            for (int k = 0; k < areaShadowSamples; k++) {
                vec3 incidentIntensity, L;
                float L_dist;
                getIncidentIntensity(float(k), P, lightPos, lightBrightness, lightSize, lightSpot, true, L_dist, L, incidentIntensity);
                
                float t_shadowHit = L_dist;
                if (!intersectShadowRay(P, L, t_shadowHit)) {
                    light_sum += incidentIntensity * shadePhong(V, N, L, diffuseColor, specularColor);
                }
            }
        }

        illuminationColor += light_sum / float(areaShadowSamples);
    }
    return illuminationColor;
}

// Faster direct illumination calculation with one sample
// includes phong shading (without specularity)
vec3 directIlluminationFast(vec3 P, vec3 N, vec3 diffuseColor) {
    vec3 illuminationColor;

    // Add direct lighting from each light
    // stops the calculations asap using many conditionals
    // nested if's seem to have better performance than continues, but break's would give best perf (with one light)
    for (int i = 0; i < numLights; i++) {
        vec3 L = lightPos[i] - P;
        float L_dist = length(L);
        L = normalize(L);
        
        vec2 lightSpot = lightSpot[i];
        float spotAttenuation = 1.0;
        if (lightSpot.x > 0.0) {
            float dot_to_light = dot(L, vec3(0.0, 1.0, 0.0));
            spotAttenuation = (dot_to_light > lightSpot.x) ? pow(dot_to_light, lightSpot.y) : 0.0;
        }
            
        if (spotAttenuation > 0.0) { // Skip if the point is outside of spotlight
            vec3 lightBrightness = lightBrightness[i];
            float distAttenuation = 1.0 / (attenuationFactor.x*square(L_dist) + attenuationFactor.y*L_dist);
                
            if (distAttenuation > 0.004) { // Skip if the brightness of light at the point is too small
                float NoL = dot(N, L);

                // Skip if normal and vector to light point at different directions
                if (NoL > 0.0) {
                    
                    // Skip if the light ray intersected with an object before reaching the point
                    float shadowHitDist = L_dist;
                    if (!intersectShadowRay(P, L, shadowHitDist)) {
                        vec3 illuminationIntensity = lightBrightness * distAttenuation * spotAttenuation;
                        illuminationColor += diffuseColor * illuminationIntensity * NoL;
                    }
                }
            }
        }
    }
    return illuminationColor;
}

float G1_Smith(float alpha_sqr, float NdotL) {
    return 2.0 * NdotL / (NdotL + sqrt(alpha_sqr + (1.0 - alpha_sqr) * square(NdotL)));
}

// Algorithm: http://jcgt.org/published/0007/04/01/
// & https://github.com/NVIDIA/Q2RTX/issues/40
vec3 importanceSampleGGX_VNDF(vec2 u, float alpha, vec3 V, mat3 basis) {
    vec3 Ve = -vec3(dot(V, basis[0]), dot(V, basis[2]), dot(V, basis[1]));
    vec3 Vh = normalize(vec3(alpha * Ve.x, alpha * Ve.y, Ve.z));
    
    float lensq = square(Vh.x) + square(Vh.y);
    vec3 T1 = lensq > 0.0 ? vec3(-Vh.y, Vh.x, 0.0) * inversesqrt(lensq) : vec3(1.0, 0.0, 0.0);
    vec3 T2 = cross(Vh, T1);

    float r = sqrt(u.x);
    float phi = 2.0 * PI * u.y;
    float t1 = r * cos(phi);
    float t2 = r * sin(phi);
    float s = 0.5 * (1.0 + Vh.z);
    t2 = (1.0 - s) * sqrt(1.0 - square(t1)) + s * t2;

    vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - square(t1) - square(t2))) * Vh;

    // Tangent space H
    vec3 Ne = vec3(alpha * Nh.x, max(0.0, Nh.z), alpha * Nh.y);

    // World space H
    return normalize(basis * Ne);
}

/** 
* Calculates indirect illumination with Monte Carlo sampling for metallic surfaces
*   - Uses VNDF importance sampling to model GGX BRDF
*   - Uses only one bounce due to exponential performance hit
* 
* Arguments:
*   P           : the point at which lighting is calculated
*   V           : direction of ray (towards P)
*   N           : surface normal at P
*   diffuse     : diffuse color of surface at P
*   roughness   : [0,1] non squared roughness of surface at P
*
* Returns:
*   vec3        : indirect light at P
*/
vec3 indirectIlluminationGGX(vec3 P, vec3 V, vec3 N, vec3 diffuse, float roughness) {
    vec3 indirect_sampling_sum;
    mat3 basis = construct_ONB_frisvad(N);
    float VNDF_alpha = square(roughness);
    float G1_alpha = square(square(max(roughness, 0.02)));

    for (int i = 0; i < indirectSamples; i++) {
		vec3 H = importanceSampleGGX_VNDF(vec2(random(P.xz), random(P.xy)), VNDF_alpha, V, basis);
		vec3 R = reflect(V, H);
        float NoR = max(0.0, dot(N, R));
        float G1_NoR = G1_Smith(G1_alpha, NoR);
        R = normalize(R);

        float hitDist = 20.0;
        vec3 P2, N2, diffuse2, specular2, reflective2;
        float roughness2;
        bool intersectLight = true;
        
        // Intersect the bounced ray
        // Add lighting from the secondary hit point
        intersect(P, R, hitDist, 0.01, P2, N2, diffuse2, specular2, reflective2, roughness2, intersectLight);
        indirect_sampling_sum += intersectLight ? diffuse2 : G1_NoR * directIlluminationFast(P2, N2, diffuse2+reflective2);
    }
    // Return the scaled indirect light
    return ((indirect_sampling_sum*rcp_indirectSamples) * diffuse);
}

// Get semi-random point in unit sphere using fibonacci spiral (https://stackoverflow.com/questions/9600801/evenly-distributing-n-points-on-a-sphere)
vec3 fibonacciSphereDir(vec2 rand, float sampleIdx, float inv_samples, float jitter_scale) {
    float y = (1.0 - sampleIdx * inv_samples * 2.0) + (random(rand)*5.0-2.5)*jitter_scale; // y goes from 1 to -1 (with added jitter)
    float radius = sqrt(1.0 - y*y); // radius at y
    float theta = (PHI * sampleIdx) + (random(rand)*10.0-5.0)*jitter_scale; // golden angle increment in spiral (with added jitter)
    return vec3(cos(theta)*radius, y, sin(theta)*radius);
}

// Same as indirectGGX, but optimized for fully diffuse surfaces
vec3 indirectIlluminationLambert(vec3 P, vec3 V, vec3 N, vec3 diffuseColor) {
    vec3 indirect_sampling_sum;
    vec3 mirrorDir = reflect(V, N);
    vec2 rand = P.yx*P.z;

    for (int i = 0; i < indirectSamples; i++) {
        // Direction is calculated with Lambert's cosine law (https://raytracing.github.io/books/RayTracingInOneWeekend.html#diffusematerials)
        vec3 diffuseDir = normalize(N + fibonacciSphereDir(rand, float(i)+0.5, rcp_indirectSamples, indirectJitterScale));
        vec3 R = normalize(mix(mirrorDir, diffuseDir, 1.0));

        float hitDist = 10.0;
        vec3 P2, N2, diffuse2, specular2, reflective2;
        float roughness2;
        bool intersectLight = false;

        intersect(P, R, hitDist, 0.01, P2, N2, diffuse2, specular2, reflective2, roughness2, intersectLight);
        indirect_sampling_sum += directIlluminationFast(P2, N2, diffuse2+reflective2);
    }
    return ((indirect_sampling_sum*rcp_indirectSamples) * diffuseColor);
}

// Calculates and returns mirror reflections on a given point
vec3 reflectionIllumination(vec3 P, vec3 V, vec3 N, vec3 reflectiveColor) {
    vec3 reflectionSum;
    for (int i = 0; i < rayBounces; i++) {
        if (reflectiveColor.x + reflectiveColor.y + reflectiveColor.z == 0.0) break; // Stop if we reach max number of bounces or hit material that is not reflective

        V = reflect(V, N); // Get the direction of the reflected ray
        
        float hitDist = 20.0;
        vec3 P2, diffuse2, specular2, reflective2;
        float roughness2;
        bool intersectLight = true;

        // Trace the reflected ray and add the result to pixel
        intersect(P, V, hitDist, 0.01, P2, N, diffuse2, specular2, reflective2, roughness2, intersectLight);
        vec3 mirror_sample_color = intersectLight ? diffuse2 : directIllumination(P2, V, N, diffuse2, specular2, false);
        
        if (enableRefGI) // Add indirect illumination to reflection
            mirror_sample_color += indirectIlluminationLambert(P2, V, N, diffuse2);
        else
            mirror_sample_color += ambientLight * diffuse2;

        P = P2;
        reflectionSum += mirror_sample_color * reflectiveColor;
        reflectiveColor = reflective2 * reflectiveColor;  // Successive ray colors are affected by each reflective surface's color
    }
    return reflectionSum;
}
          
vec3 LinearToSRGB(vec3 rgb) {     
    return mix(
        pow(rgb, vec3(1.0 / 2.2)) * 1.055 - 0.055,
        rgb * 12.92,
        LessThan(rgb, 0.0031308)
    );
}

vec3 ACESFilm(vec3 x) {
    x = ACESInputMat * x;
    vec3 a = x * (x + 0.0245786) - 0.000090537;
    vec3 b = x * (0.983729 * x + 0.4329510) + 0.238081;
    x = a / b;
    x = ACESOutputMat * x;
    return clamp(x, 0.0, 1.0);
}

// Simple color averaging from previous frames
vec4 averageTAA(vec3 pixelColor) {
    if (enableTAA)
        return u_taaBlendFactor * min(vec4(pixelColor, 1), 1.0) + (1.0-u_taaBlendFactor) * texture(u_texture, texCoord);
    else
        return vec4(pixelColor, 1);
}


void main() {
    vec3 ray_dir = normalize(ray);
    float hit_dist = length(ray); // The far clipping distance
    vec3 pixelColor, diffuseColor, specularColor, reflectiveColor, normal, point;
    float roughness;
    bool intersectLight = true;
    randomIncrement = randomseed;

    // intersect the ray with objects (tmin is 0, because vertex shader places the origin of the ray in near clipping distance)
    intersect(origin, ray_dir, hit_dist, 0.0, point, normal, diffuseColor, specularColor, reflectiveColor, roughness, intersectLight);

    // If the ray hit a light, return its color because it doesn't have any other properties than surface color
    if (intersectLight) {
        fragColor = averageTAA(diffuseColor);
        return;
    }

    // Ambient light
    if (!enableGI)
        pixelColor += ambientLight * diffuseColor;

    // ==== DIRECT ILLUMINATION ====
    // For GGX surfaces direct illumination may or may not be added; currently scale the amount by roughness
    // See more about conductors and dielectrics in: https://google.github.io/filament/Filament.html#figure_dielectricconductor
    pixelColor += roughness * directIllumination(point, ray_dir, normal, diffuseColor, specularColor, true);

    // ==== INDIRECT ILLUMINATION ====
    if (enableGI && diffuseColor.r > 0.0 && diffuseColor.g > 0.0 && diffuseColor.b > 0.0) {
        if (roughness < 1.0) // GGX is much slower, so use it only when needed
            pixelColor += indirectIlluminationGGX(point, ray_dir, normal, diffuseColor, roughness);
        else
            pixelColor += indirectIlluminationLambert(point, ray_dir, normal, diffuseColor);
    }
        
    // ==== MIRROR REFLECTION ====
    if (rayBounces > 0 && length(reflectiveColor) > 0.0)
        pixelColor += reflectionIllumination(point, ray_dir, normal, reflectiveColor);

    // ==== POST FX & OUTPUT ====
    // ACES tonemapping (source: https://github.com/TheRealMJP/BakingLab/blob/master/BakingLab/ACES.hlsl)
    pixelColor = ACESFilm(pixelColor);
    pixelColor = LinearToSRGB(pixelColor);
    
    fragColor = averageTAA(pixelColor);
}