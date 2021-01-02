precision mediump float;

uniform vec3 sphereCenters[5];
uniform vec3 sphereColors[5];
uniform vec3 lightPosition[2];
uniform vec3 lightIntensity[2];
uniform float planeOffsets[4];
uniform vec3 planeNormals[4];
uniform vec3 planeColors[4];
uniform vec3 ambientLight;

varying vec3 vPosition;

const float quadratic_attenuation = 0.05;
const float linear_attenuation = 1.0;
const float constant_attenuation = 0.0;
const vec3 specular_color = vec3(1.0, 1.0, 1.0);
const float specular_exponent = 32.0;
const float EPSILON = 0.001;

void pointLightIllumination(vec3 p, vec3 position, vec3 intensity, out float light_distance, out vec3 dir_to_light, out vec3 incident_intensity) {
    vec3 vec_to_light = position - p;
    light_distance = length(vec_to_light);
    float attenuation = 1.0 / (quadratic_attenuation*pow(light_distance, 2.0) + linear_attenuation*light_distance + constant_attenuation);
    vec_to_light = normalize(vec_to_light);

    dir_to_light = vec_to_light;
    incident_intensity = intensity * attenuation;
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

bool intersect(vec3 ray_origin, vec3 ray_direction, inout float t_hit, float tmin, out vec3 position, out vec3 color, out vec3 normal) {
    bool intersected = false;

    // Intersect spheres
    for (int i = 0; i < 5; i++) {
        vec3 center = sphereCenters[i];
	    bool tmp = intersectSphere(ray_origin, ray_direction, center, 0.8, tmin, t_hit);
        if (tmp) {
            position = ray_origin + ray_direction * t_hit;
		    normal = normalize(position - center);
            color = sphereColors[i];
			intersected = true;
        }
    }

    // Intersect planes
    for (int i = 0; i < 4; i++) {
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
    for (int i = 0; i < 2; i++) {
        vec3 center = lightPosition[i];
	    bool tmp = intersectSphere(ray_origin, ray_direction, center, 0.08, tmin, t_hit);
        if (tmp) {
            position = ray_origin + ray_direction * t_hit;
		    normal = normalize(position - center);
            color = vec3(100.0, 100.0, 100.0);
			intersected = true;
        }
    }

    return intersected;
}

// Faster intersect function for shadows
bool intersectShadowRay(vec3 ray_origin, vec3 ray_direction, inout float t_hit, float tmin) {
    for (int i = 0; i < 5; i++) {
        vec3 center = sphereCenters[i];
	    if (intersectSphere(ray_origin, ray_direction, center, 0.8, tmin, t_hit))
            return true;
    }
    for (int i = 0; i < 4; i++) {
        float planeOffset = planeOffsets[i];
        vec3 planeNormal = planeNormals[i];
	    if (intersectPlane(ray_origin, ray_direction, planeOffset, planeNormal, tmin, t_hit))
            return true;
    }
    return false;
}

void main() {
    vec3 camera_pos = vec3(0, 0, -10.0);
    vec3 ray_dir = normalize(vPosition - camera_pos);

    vec3 answer, color, normal, point;
    float t_hit = 100.0;

    intersect(camera_pos, ray_dir, t_hit, 0.01, point, color, normal); // intersect the ray with the primitives

    // Ambient light
    answer += ambientLight * color;

    // ==== DIRECT ILLUMINATION ====
    for (int i = 0; i < 2; i++) {
        vec3 incident_intensity, dir_to_light;
        float light_distance;
        pointLightIllumination(point, lightPosition[i], lightIntensity[i], light_distance, dir_to_light, incident_intensity);
        
        // Shoot shadow ray from the original intersection to light
        vec3 shadowRay_dir = dir_to_light;
        float t_shadowHit = light_distance;
        intersectShadowRay(point, shadowRay_dir, t_shadowHit, 0.01);

        if (abs(t_shadowHit - light_distance) < EPSILON) {
            answer += shadePhong(ray_dir, normal, dir_to_light, incident_intensity, color);
        }
    }

    gl_FragColor = vec4(answer, 1.0);
}