precision mediump float;

#define MAX_POINTLIGHTS 10
#define MAX_AREALIGHTS 5
#define MAX_SPHERES 10
#define MAX_PLANES 5
#define MAX_SHADOW_SAMPLES 49
#define MAX_RAYBOUNCES 5

uniform int numPointLights;
uniform vec3 pointLightPos[MAX_POINTLIGHTS];
uniform vec3 pointLightIntensity[MAX_POINTLIGHTS];

uniform int numAreaLights;
uniform vec3 areaLightPos[MAX_AREALIGHTS];
uniform vec2 areaLightSize[MAX_AREALIGHTS];
uniform vec3 areaLightIntensity[MAX_AREALIGHTS];
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

varying lowp vec3 origin;
varying lowp vec3 ray;

#define quadratic_attenuation 0.2
#define linear_attenuation 0.3
#define constant_attenuation 0.0
const vec3 specular_color = vec3(1.0, 1.0, 1.0);
#define specular_exponent 32.0

#define EPSILON 0.001
float randomSeed = 0.87;

// https://stackoverflow.com/a/10625698
float random( vec2 p ) {
    vec2 K1 = vec2(
        23.14069263277926, // e^pi (Gelfond's constant)
         2.665144142690225 // 2^sqrt(2) (Gelfondâ€“Schneider constant)
    );
    return fract( cos( dot(p,K1) ) * 12345.6789 );
}

float modulo(float a, float b) {
    return (a)-(floor((a)/(b))*(b));
}

bool intersectSphere(vec3 ray_origin, vec3 ray_direction, vec3 center_, float radius, float tmin, inout float t_hit) {
    vec3 tmp = center_ - ray_origin;
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

bool intersectPlane(vec3 ray_origin, vec3 ray_direction, float offset, vec3 normal, float tmin, inout float t_hit) {
    vec3 normal_offset = normal * offset;
    float d = normal_offset.x + normal_offset.y + normal_offset.z;
	float t = (d - dot(normal, ray_origin)) / dot(normal, ray_direction);
	
	if (t < t_hit && t > tmin) {
		t_hit = t;
		return true;
	}
	return false;
}

bool intersect(vec3 ray_origin, vec3 ray_direction, inout float t_hit, float tmin, out vec3 position, out vec3 color, inout vec3 reflectiveColor, out vec3 normal) {
    bool intersected = false;

    // Intersect spheres
    for (int i = 0; i < MAX_SPHERES; i++) {
        if (i >= numSpheres) break;
        vec3 center = sphereCenters[i];
	    bool tmp = intersectSphere(ray_origin, ray_direction, center, 0.8, tmin, t_hit);
        if (tmp) {
            position = ray_origin + ray_direction * t_hit;
		    normal = normalize(position - center);
            color = sphereColors[i];
            reflectiveColor = reflectiveColors[i];
			intersected = true;
        }
    }

    // Intersect planes
    for (int i = 0; i < MAX_PLANES; i++) {
        if (i >= numPlanes) break;
        float planeOffset = planeOffsets[i];
        vec3 planeNormal = planeNormals[i];
	    bool tmp = intersectPlane(ray_origin, ray_direction, planeOffset, planeNormal, tmin, t_hit);
        if (tmp) {
            position = ray_origin + ray_direction * t_hit;
		    normal = planeNormal;
            color = planeColors[i];
			intersected = true;
        }
    }

    // Intersect light spheres
    for (int i = 0; i < MAX_POINTLIGHTS; i++) {
        if (i >= numPointLights) break;
        vec3 center = pointLightPos[i];
	    bool tmp = intersectSphere(ray_origin, ray_direction, center, 0.08, tmin, t_hit);
        if (tmp) {
            position = ray_origin + ray_direction * t_hit;
		    normal = normalize(position - center);
            color = pointLightIntensity[i] * 100.0;
			intersected = true;
        }
    }

    // Intersect light spheres
    for (int i = 0; i < MAX_AREALIGHTS; i++) {
        if (i >= numAreaLights) break;
        vec3 center = areaLightPos[i];
	    bool tmp = intersectSphere(ray_origin, ray_direction, center, 0.08, tmin, t_hit);
        if (tmp) {
            position = ray_origin + ray_direction * t_hit;
		    normal = normalize(position - center);
            color = areaLightIntensity[i] * 100.0;
			intersected = true;
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
	    if (intersectPlane(ray_origin, ray_direction, planeOffset, planeNormal, tmin, t_hit))
            return true;
    }
    return false;
}

void pointLightIllumination(vec3 p, vec3 position, vec3 intensity, out float light_distance, out vec3 dir_to_light, out vec3 incident_intensity) {
    vec3 vec_to_light = position - p;
    light_distance = length(vec_to_light);
    float attenuation = 1.0 / (quadratic_attenuation*pow(light_distance, 2.0) + linear_attenuation*light_distance + constant_attenuation);
    
    dir_to_light = normalize(vec_to_light);
    incident_intensity = intensity * attenuation;
}

void areaLightIllumination(vec3 p, vec3 position, vec3 intensity, vec2 size, float sample_i, out float light_distance, out vec3 dir_to_light, out vec3 incident_intensity) {
    float inv_dim = 1.0 / shadowDim;
    
    // Get jittered position on the plane
    float cell_sizeX = size.x * inv_dim;
	float cell_sizeY = size.y * inv_dim;
    float xGrid = floor(modulo(sample_i, shadowDim));
    float yGrid = floor(sample_i * inv_dim);
	float posX = cell_sizeX * (xGrid + random(p.xy*randomSeed));
    float posY = cell_sizeY * (yGrid + random(p.yx*randomSeed));
	float x = position.x - size.x*0.5 + posX;
	float z = position.z - size.y*0.5 + posY;
		
	vec3 vec_to_light = vec3(x, position.y, z) - p;
    
    light_distance = length(vec_to_light);
    float attenuation = 1.0 / (quadratic_attenuation*pow(light_distance, 2.0) + linear_attenuation*light_distance + constant_attenuation);
    
    dir_to_light = normalize(vec_to_light);
    incident_intensity = intensity * attenuation;
    randomSeed += 0.01;
}

vec3 shadePhong(vec3 ray_direction, vec3 normal, vec3 dir_to_light, vec3 incident_intensity, vec3 diffuse_color) {
    vec3 light_incident = incident_intensity * max(0.0, dot(normal, dir_to_light));	        // Brightness depends on the angle of the light and normal

	vec3 specular;
	if (dot(normal, dir_to_light) > 0.0) {												    // Only add specular if light is on the same side as normal
		vec3 vect_reflection = -dir_to_light - 2.0 * dot(-dir_to_light, normal) * normal;	// Reflection vector pointing away from object
		vec3 vect_camera = -ray_direction;													// Vector pointing from object to camera
		float reflection_intensity = pow(max(0.0, dot(vect_reflection, vect_camera)), specular_exponent);// How closely the reflection vector points to the camera = intensity
		specular = specular_color * reflection_intensity;
	}

    return light_incident * (diffuse_color + specular);
}

vec3 illumination(vec3 point, vec3 ray_dir, vec3 normal, vec3 diffuseColor) {
    vec3 illuminationColor;
    // Point lights
    for (int i = 0; i < MAX_POINTLIGHTS; i++) {
        if (i >= numPointLights) break;
        vec3 incident_intensity, dir_to_light;
        float light_distance;
        pointLightIllumination(point, pointLightPos[i], pointLightIntensity[i], light_distance, dir_to_light, incident_intensity);
        
        // Shoot shadow ray from the original intersection to light
        vec3 shadowRay_dir = dir_to_light;
        float t_shadowHit = light_distance;
        intersectShadowRay(point, shadowRay_dir, t_shadowHit, 0.01);

        if (abs(t_shadowHit - light_distance) < EPSILON) {
            illuminationColor += shadePhong(ray_dir, normal, dir_to_light, incident_intensity, diffuseColor);
        }
    }
    // Area lights (smooth shadows)
    for (int i = 0; i < MAX_AREALIGHTS; i++) {
        if (i >= numAreaLights) break;
        vec3 light_sum;
        for (int sample = 0; sample < MAX_SHADOW_SAMPLES; sample++) {
            if (sample >= shadowSamples) break;
            vec3 incident_intensity, dir_to_light;
            float light_distance;
            areaLightIllumination(point, areaLightPos[i], areaLightIntensity[i], areaLightSize[i], float(sample), light_distance, dir_to_light, incident_intensity);
            
            vec3 shadowRay_dir = dir_to_light;
            float t_shadowHit = light_distance;
            intersectShadowRay(point, shadowRay_dir, t_shadowHit, 0.01);

            if (abs(t_shadowHit - light_distance) < EPSILON) {
                light_sum += shadePhong(ray_dir, normal, dir_to_light, incident_intensity, diffuseColor);
            }
        }
        illuminationColor += light_sum / float(shadowSamples);
    }

    return illuminationColor;
}

void main() {
    vec3 ray_dir = normalize(ray);
    vec3 pixelColor, diffuseColor, reflectiveColor, normal, point;
    float t_hit = 100.0;
    intersect(origin, ray_dir, t_hit, 0.01, point, diffuseColor, reflectiveColor, normal); // intersect the ray with objects

    // Ambient light
    pixelColor += ambientLight * diffuseColor;

    // ==== DIRECT ILLUMINATION ====
    pixelColor += illumination(point, ray_dir, normal, diffuseColor);

    // ==== MIRROR REFLECTION ====
    vec3 bounceDir = ray_dir;
    vec3 bounceOrigin = point;
    vec3 bounceNormal = normal;
    for (int i = 0; i < MAX_RAYBOUNCES; i++) {
        if (i >= rayBounces) break;
        if (length(reflectiveColor) > 0.0) {
			vec3 mirrorDir = vec3(bounceDir - 2.0 * dot(bounceDir, bounceNormal) * bounceNormal);	// Get the direction of the reflected ray

			// Trace the mirror ray and add the result to pixel
            float t_bounceHit = 100.0;
            vec3 bounceDiffuseColor, bounceReflectiveColor, bounceHitPoint;
            intersect(bounceOrigin, mirrorDir, t_bounceHit, 0.01, bounceHitPoint, bounceDiffuseColor, bounceReflectiveColor, bounceNormal);
            vec3 mirror_sample_color = illumination(bounceHitPoint, mirrorDir, bounceNormal, bounceDiffuseColor);

			pixelColor += mirror_sample_color * reflectiveColor;
            bounceOrigin = bounceHitPoint;
            bounceDir = mirrorDir;
            reflectiveColor = bounceReflectiveColor * reflectiveColor;  // Simulates the ray color being affected by the reflective color
		}
    }

    gl_FragColor = vec4(pixelColor, 1.0);
}