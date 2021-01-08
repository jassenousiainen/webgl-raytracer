// Define here the objects and their default states in the world
let WorldState = {
    lights: [
        {x: 0, y: 3.9999, z: 0, r: 1, g: 1, b: 1, sizeX: 2, sizeY: 2, brightness: 2.5, rotate: false, enabled: true},
        {x: -3, y: 2, z: 0, r: 1, g: 1, b: 1, sizeX: 0.3, sizeY: 0.3, brightness: 0.3, rotate: true, enabled: true}
    ],
    spheres : [
        {x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, rr: 1, rg: 1, rb: 1},
        {x: 1.25, y: 1.25, z: 1.25, r: 0, g: 1.0, b: 0, rr: 0, rg: 0.1, rb: 0},
        {x: -1.25, y: -1.25, z: 1.25, r: 0, g: 0, b: 0, rr: 0, rg: 1, rb: 1},
        {x: -1.25, y: 1.25, z: -1.25, r: 0, g: 0, b: 1.0, rr: 0, rg: 0, rb: 0.5},
        {x: 1.25, y: -1.25, z: -1.25, r: 0, g: 0, b: 0, rr: 1, rg: 0, rb: 1}
    ],
    planes : [
        {x: 0.0, y: 1.0, z: 0, r: 1.0, g: 1.0, b: 1.0, offset: -4.0, enabled: true, desc: 'floor'},
        {x: 0, y: -1.0, z: 0.0, r: 1.0, g: 1.0, b: 1.0, offset: 4.0, enabled: true, desc: 'ceiling'},
        {x: -1.0, y: 0.0, z: 0, r: 1.0, g: 0.3, b: 0.3, offset: 4.0, enabled: true, desc: 'right wall'},
        {x: 1.0, y: 0.0, z: 0, r: 0.3, g: 1.0, b: 0.3, offset: -4.0, enabled: true, desc: 'left wall'},
        {x: 0, y: 0, z: 1.0, r: 1.0, g: 1.0, b: 1.0, offset: -4.0, enabled: true, desc: 'back wall'},
        {x: 0, y: 0, z: -1.0, r: 1.0, g: 1.0, b: 1.0, offset: 4.0, enabled: false, desc: 'front wall'}
    ]
}

// Add the inputs to html
function addLightInputs(i, lightArr) {
    const container = document.getElementById("lightcontrols");
    htmlStr = `
        <br>
        <b>light ${i+1}</b><br>
        <input type="checkbox" onInput="WorldState.lights[${i}].enabled = this.checked" ${lightArr[i].enabled && "checked"}> on/off<br>
        <table class="sliders">
            <tr>
                <td><label>Bright:</label></td>
                <td><input type="range" min="0" max="10" value="${lightArr[i].brightness}" step="0.1" onInput="WorldState.lights[${i}].brightness = this.value"></td>
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
                <td><input type="range" min="0" max="3" value="${lightArr[i].sizeX}" step="0.1" onInput="WorldState.lights[${i}].sizeX = this.value"></td>
            <tr>
                <td><label>sizeY:</label></td>
                <td><input type="range" min="0" max="3" value="${lightArr[i].sizeY}" step="0.1" onInput="WorldState.lights[${i}].sizeY = this.value"></td>
            </tr>
        </table>`;
    container.insertAdjacentHTML('beforeend', htmlStr);
}

function addPlaneInputs(i, planeArr) {
    const container = document.getElementById("planecontrols");
    htmlStr = `
        <input type="checkbox" onInput="WorldState.planes[${i}].enabled = this.checked" ${planeArr[i].enabled && "checked"}><b>${planeArr[i].desc}</b><br>`;
    container.insertAdjacentHTML('beforeend', htmlStr);
}

for (let i = 0; i < WorldState.lights.length; i++) {
    addLightInputs(i, WorldState.lights);
}

for (let i = 0; i < WorldState.planes.length; i++) {
    addPlaneInputs(i, WorldState.planes);
}