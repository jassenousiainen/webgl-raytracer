precision mediump float;

#define MAX_LIGHTS 5
#define MAX_SPHERES 10
#define MAX_PLANES 5
#define MAX_SHADOW_SAMPLES 49
#define MAX_RAYBOUNCES 5
#define MAX_GISAMPLES 100

uniform int numLights;
uniform vec3 lightPos[MAX_LIGHTS];
uniform vec2 lightSize[MAX_LIGHTS];
uniform vec3 lightIntensity[MAX_LIGHTS];
uniform int shadowSamples;
uniform float shadowDim;

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

varying lowp vec3 origin;
varying lowp vec3 ray;

#define quadratic_attenuation 0.1
#define linear_attenuation 0.4
#define constant_attenuation 0.0
#define specular_exponent 32.0
#define EPSILON 0.001
#define PI 3.141593
float randomSeed = 0.1;

// https://stackoverflow.com/a/10625698
float random( vec2 p ) {
    vec2 K1 = vec2(
        23.14069263277926, // e^pi (Gelfond's constant)
         2.665144142690225 // 2^sqrt(2) (Gelfondâ€“Schneider constant)
    );
    randomSeed += 0.02; // increment, so that each access gets different value
    return fract( cos( dot(p+randomSeed,K1) ) * 12345.6789 );
}

float modulo(float a, float b) {
    return (a)-(floor((a)/(b))*(b));
}

bool intersectSphere(vec3 ray_origin, vec3 ray_direction, vec3 center, float radius, float tmin, inout float t_hit) {
    vec3 tmp = center - ray_origin;
	vec3 dir = ray_direction;

	float A = dot(dir, dir);
	float B = - 2.0 * dot(dir, tmp);
	float C = dot(tmp, tmp) - pow(radius, 2.0);
	float radical = B*B - 4.0*A*C;
	if (radical < 0.0)
		return false;

	radical = sqrt(radical);
	float t_m = ( -B - radical ) / ( 2.0 * A );
	float t_p = ( -B + radical ) / ( 2.0 * A );
	vec3 pt_m = ray_origin + ray_direction * t_m;
	vec3 pt_p = ray_origin + ray_direction * t_p;

	float t = (t_m < tmin) ? t_p : t_m;
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
            out vec3 diffuseColor,
            out vec3 specularColor,
            out vec3 reflectiveColor,
            inout bool isLight)
{
    bool intersected = false;

    // Intersect spheres
    for (int i = 0; i < MAX_SPHERES; i++) {
        if (i >= numSpheres) break;
        vec3 center = sphereCenters[i];
	    bool tmp = intersectSphere(ray_origin, ray_direction, center, 0.8, tmin, t_hit);
        if (tmp) {
            position = ray_origin + ray_direction * t_hit;
		    normal = normalize(position - center);
            diffuseColor = sphereColors[i];
            specularColor = vec3(1.0, 1.0, 1.0);
            reflectiveColor = reflectiveColors[i];
			intersected = true;
        }
    }

    // Intersect planes
    for (int i = 0; i < MAX_PLANES; i++) {
        if (i >= numPlanes) break;
        vec3 planeNormal = planeNormals[i];
	    bool tmp = intersectPlane(ray_origin, ray_direction, planeOffsets[i], planeNormal, vec3(0,0,0), vec2(0,0), tmin, t_hit);
        if (tmp) {
            position = ray_origin + ray_direction * t_hit;
		    normal = planeNormal;
            diffuseColor = planeColors[i];
            specularColor = vec3(0.5, 0.5, 0.5);
            reflectiveColor =vec3(0.0, 0.0, 0.0);
			intersected = true;
        }
    }

    // Intersect lights to make them visible
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= numLights) break;
        vec3 center = lightPos[i];
        vec2 size = lightSize[i];
        bool tmp = false;
        if (length(size) > 0.0)
            tmp = intersectPlane(ray_origin, ray_direction, center.y, vec3(0,1,0), center, size, tmin, t_hit);
        else
            tmp = intersectSphere(ray_origin, ray_direction, center, 0.1, tmin, t_hit);
        if (tmp) {
            diffuseColor = lightIntensity[i];
            intersected = true;
            isLight = true;
        }
    }

    return intersected;
}

// Faster intersect function for shadows
bool intersectShadowRay(vec3 ray_origin, vec3 ray_direction, inout float t_hit, float tmin) {
    for (int i = 0; i < MAX_SPHERES; i++) {
        if (i >= numSpheres) break;
        vec3 center = sphereCenters[i];
	    if (intersectSphere(ray_origin, ray_direction, center, 0.8, tmin, t_hit))
            return true;
    }
    for (int i = 0; i < MAX_PLANES; i++) {
        if (i >= numPlanes) break;
        float planeOffset = planeOffsets[i];
        vec3 planeNormal = planeNormals[i];
	    if (intersectPlane(ray_origin, ray_direction, planeOffset, planeNormal, vec3(0,0,0), vec2(0,0), tmin, t_hit))
            return true;
    }
    return false;
}

void getIncidentIntensity(vec3 p, vec3 position, vec3 intensity, vec2 size, float sample_i, out float light_distance, out vec3 vec_to_light, out vec3 incident_intensity) {
    if (length(size) > 0.0) {
        // Get jittered position on the light plane
        float inv_dim = 1.0 / shadowDim;
        float cell_sizeX = size.x * inv_dim;
        float cell_sizeY = size.y * inv_dim;
        float xGrid = floor(modulo(sample_i, shadowDim));
        float yGrid = floor(sample_i * inv_dim);
        float posX = cell_sizeX * (xGrid + random(p.xy));
        float posY = cell_sizeY * (yGrid + random(p.yx));
        float x = position.x - size.x*0.5 + posX;
        float z = position.z - size.y*0.5 + posY;
        vec_to_light = vec3(x, position.y, z) - p;
    } else {
        vec_to_light = position - p; // point light
    }
    
    light_distance = length(vec_to_light);
    float attenuation = 1.0 / (quadratic_attenuation*pow(light_distance, 2.0) + linear_attenuation*light_distance + constant_attenuation);
    
    vec_to_light = normalize(vec_to_light);
    incident_intensity = intensity * attenuation;
}

vec3 shadePhong(vec3 ray_direction, vec3 normal, vec3 dir_to_light, vec3 incident_intensity, vec3 diffuse_color, vec3 specular_color) {
    vec3 light_incident = incident_intensity * max(0.0, dot(normal, dir_to_light));	        // Brightness depends on the angle between light and normal

	vec3 specular;
	if (dot(normal, dir_to_light) > 0.0) {												    // Only add specular if light is on the same side as normal
		vec3 vect_reflection = -dir_to_light - 2.0 * dot(-dir_to_light, normal) * normal;	// Reflection vector pointing away from object
		vec3 vect_camera = -ray_direction;													// Vector pointing from object to camera
		float reflection_intensity = pow(max(0.0, dot(vect_reflection, vect_camera)), specular_exponent);// How closely the reflection vector points to the camera = intensity
		specular = specular_color * reflection_intensity;
	}

    return light_incident * (diffuse_color + specular);
}

// Calculates and returns specular and diffuse illumination from all lights on a given point
vec3 illumination(vec3 point, vec3 ray_dir, vec3 normal, vec3 diffuseColor, vec3 specularColor) {
    vec3 illuminationColor;

    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= numLights) break;
        vec3 light_sum;
        int areaShadowSamples = length(lightSize[i]) > 0.0 ? shadowSamples : 1; // If the size of the light is zero, it is point light and one sample is enough
        
        for (int sample = 0; sample < MAX_SHADOW_SAMPLES; sample++) {
            if (sample >= areaShadowSamples) break;
            vec3 incident_intensity, dir_to_light;
            float light_distance;
            getIncidentIntensity(point, lightPos[i], lightIntensity[i], lightSize[i], float(sample), light_distance, dir_to_light, incident_intensity);
            
            float t_shadowHit = light_distance;
            intersectShadowRay(point, dir_to_light, t_shadowHit, 0.01);

            if (abs(t_shadowHit - light_distance) < EPSILON) {
                light_sum += shadePhong(ray_dir, normal, dir_to_light, incident_intensity, diffuseColor, specularColor);
            }
        }

        illuminationColor += light_sum / float(areaShadowSamples);
    }
    return illuminationColor;
}

// Calculates and returns indirect illumination on a given point
// uses only one bounce because of exponential performance hit
vec3 indirectIllumination(vec3 point, vec3 normal, vec3 diffuseColor) {
    if (length(diffuseColor) == 0.0) return vec3(0,0,0); // don't do useless calculations if the surface doesn't have a diffuse color

    mat3 transform;
    if (abs(normal.x) > abs(normal.y))
        transform[2] = vec3(normal.z, 0, -normal.x) / sqrt(normal.x * normal.x + normal.z * normal.z);
    else
        transform[2] = vec3(0, -normal.z, normal.y) / sqrt(normal.y * normal.y + normal.z * normal.z);
    transform[0] = cross(normal, transform[2]);
    transform[1] = normal;

    // Sample rays uniformly over hemisphere with spherical coordinates
    vec3 indirect_sampling_sum;
    for (int sample = 0; sample < MAX_GISAMPLES; sample++) {
        if (sample >= indirectSamples) break;
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
    vec3 reflectionSum, mirrorDir, bounceDiffuseColor, bounceSpecularColor, bounceReflectiveColor, bounceHitPoint;
    for (int i = 0; i < MAX_RAYBOUNCES; i++) {
        if (i >= rayBounces || length(reflectiveColor) == 0.0) break; // Stop if we reach max number of bounces or hit material that is not reflective

		// Trace the mirror ray and add the result to pixel
        mirrorDir = vec3(rayDir - 2.0 * dot(rayDir, normal) * normal); // Get the direction of the reflected ray
        float t_bounceHit = 50.0;
        bool isLight = false;
        intersect(origin, mirrorDir, t_bounceHit, 0.01, bounceHitPoint, normal, bounceDiffuseColor, bounceSpecularColor, bounceReflectiveColor, isLight);
        vec3 mirror_sample_color = isLight ? bounceDiffuseColor : illumination(bounceHitPoint, mirrorDir, normal, bounceDiffuseColor, bounceSpecularColor);
        
        if (enableRefGI) // Add indirect illumination to reflection
            mirror_sample_color += indirectIllumination(bounceHitPoint, normal, bounceDiffuseColor);

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

    // intersect the ray with objects (tmin is 0, because vertex shader places the origin in near clipping distance)
    intersect(origin, ray_dir, t_hit, 0.0, point, normal, diffuseColor, specularColor, reflectiveColor, isLight);

    if (isLight) {  // If the ray hit a light, return its color because they dont have any other properties than surface color
        gl_FragColor = vec4(diffuseColor, 1.0);
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

    gl_FragColor = vec4(pixelColor, 1.0);
}