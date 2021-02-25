// Define here the objects and their default states in the world
let WorldState = {
    lights: [
        {x: 0, y: 3.999999, z: 0, r: 1, g: 1, b: 1, sizeX: 2, sizeY: 2, brightness: 50, spotSize: 0.001, spotIntensity: 1.5, rotate: false, enabled: true},
        {x: -3.3, y: 2.5, z: 0, r: 1, g: 1, b: 1, sizeX: 0.3, sizeY: 0.3, brightness: 100, spotSize: 0.9, spotIntensity: 0.0, rotate: true, enabled: false}
    ],
    spheres : [
        {x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, rr: 1, rg: 1, rb: 1},
        {x: 1.25, y: 1.25, z: 1.25, r: 0.02, g: 1.0, b: 0.02, rr: 0, rg: 0, rb: 0},
        {x: -1.25, y: -1.25, z: 1.25, r: 0, g: 0, b: 0, rr: 0, rg: 1, rb: 1},
        {x: -1.25, y: 1.25, z: -1.25, r: 0.02, g: 0.02, b: 1.0, rr: 0, rg: 0, rb: 0},
        {x: 1.25, y: -1.25, z: -1.25, r: 0, g: 0, b: 0, rr: 1, rg: 0, rb: 1}
    ],
    planes : [
        {x: 0.0, y: 1.0, z: 0, r: 1.0, g: 1.0, b: 1.0, offset: -4.0, enabled: true, desc: 'floor'},
        {x: 0, y: -1.0, z: 0.0, r: 1.0, g: 1.0, b: 1.0, offset: 4.0, enabled: true, desc: 'ceiling'},
        {x: -1.0, y: 0.0, z: 0, r: 1.0, g: 0.1, b: 0.1, offset: 4.0, enabled: true, desc: 'right wall'},
        {x: 1.0, y: 0.0, z: 0, r: 0.1, g: 1.0, b: 0.1, offset: -4.0, enabled: true, desc: 'left wall'},
        {x: 0, y: 0, z: 1.0, r: 1.0, g: 1.0, b: 1.0, offset: -4.0, enabled: true, desc: 'back wall'},
        {x: 0, y: 0, z: -1.0, r: 1.0, g: 1.0, b: 1.0, offset: 4.0, enabled: false, desc: 'front wall'}
    ],
    quadraticAttenuation: 1.5,
    linearAttenuation: 0.0
}

// Add the inputs to html (note that the event handling is integrated into the elements' onInput -functions)
function addLightInputs(i, lightArr) {
    const container = document.getElementById("lightcontrols");
    const htmlStr = `
        <br>
        <b>light ${i+1}</b><br>
        <input type="checkbox" onInput="WorldState.lights[${i}].enabled = this.checked" ${lightArr[i].enabled && "checked"}> on/off<br>
        <table class="sliders">
            <tr>
                <td><label>Bright:</label></td>
                <td><input type="range" min="0" max="100" value="${lightArr[i].brightness}" step="0.1" onInput="WorldState.lights[${i}].brightness = this.value"></td>
            </tr>
            <tr>
                <td><label>Spot size:</label></td>
                <td><input type="range" min="0" max="1" value="${1-lightArr[i].spotSize}" step="0.01" onInput="WorldState.lights[${i}].spotSize = 1-this.value"></td>
            </tr>
            <tr>
                <td><label>Spot falloff:</label></td>
                <td><input type="range" min="0" max="4" value="${lightArr[i].spotIntensity}" step="0.01" onInput="WorldState.lights[${i}].spotIntensity = this.value"></td>
            </tr>
            <tr>
                <td><label>r:</label></td>
                <td><input type="range" min="0" max="1" value="1" step="0.1" onInput="WorldState.lights[${i}].r = this.value"></td>
            </tr>
            <tr>
                <td><label>g:</label></td>
                <td><input type="range" min="0" max="1" value="1" step="0.1" onInput="WorldState.lights[${i}].g = this.value"></td>
            </tr>
            <tr>
                <td><label>b:</label></td>
                <td><input type="range" min="0" max="1" value="1" step="0.1" onInput="WorldState.lights[${i}].b = this.value"></td>
            </tr>
                <td><label>sizeX:</label></td>
                <td><input type="range" min="0" max="3" value="${lightArr[i].sizeX}" step="0.01" onInput="WorldState.lights[${i}].sizeX = this.value"></td>
            <tr>
                <td><label>sizeY:</label></td>
                <td><input type="range" min="0" max="3" value="${lightArr[i].sizeY}" step="0.01" onInput="WorldState.lights[${i}].sizeY = this.value"></td>
            </tr>
        </table>`;
    container.insertAdjacentHTML('beforeend', htmlStr);
}

function addPlaneInputs(i, planeArr) {
    const container = document.getElementById("planecontrols");
    const htmlStr = `
        <input type="checkbox" onInput="WorldState.planes[${i}].enabled = this.checked" ${planeArr[i].enabled && "checked"}><b>${planeArr[i].desc}</b><br>`;
    container.insertAdjacentHTML('beforeend', htmlStr);
}

const attenuationInputs = `
    Attenuation:<br>
    <input type="range" min="0" max="10" step="0.01" value="${WorldState.quadraticAttenuation}" onInput="WorldState.quadraticAttenuation = this.value"> Quadratic
    <input type="range" min="0" max="10" step="0.01" value="${WorldState.linearAttenuation}" onInput="WorldState.linearAttenuation = this.value"> Linear
    <br>`
document.getElementById("lightcontrols").insertAdjacentHTML('beforeend', attenuationInputs)

for (let i = 0; i < WorldState.lights.length; i++) {
    addLightInputs(i, WorldState.lights);
}

for (let i = 0; i < WorldState.planes.length; i++) {
    addPlaneInputs(i, WorldState.planes);
}