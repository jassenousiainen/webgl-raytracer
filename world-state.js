// Define here the objects and their default states in the world
let WorldState = {
    lights: [
        {x: 0, y: 3.999999, z: 0, r: 1, g: 1, b: 1, sizeX: 1, sizeY: 1, brightness: 50, spotSize: 0.001, spotIntensity: 1.5, rotate: false, enabled: true},
        {x: -3.3, y: 2.5, z: 0, r: 1, g: 1, b: 1, sizeX: 0.3, sizeY: 0.3, brightness: 100, spotSize: 0.9, spotIntensity: 0.0, rotate: true, enabled: false}
    ],
    spheres : [
        {x: 0, y: -1.5, z: -1.5, r: 0.9, g: 0.5, b: 0.9, rr: 0, rg: 0, rb: 0, sr: 0, sg: 0, sb: 0, roughness: 1},
        {x: 2.5, y: -3.2, z: -1.5, r: 0, g: 0, b: 0, rr: 0.9, rg: 0.9, rb: 0.9, sr: 1, sg: 1, sb: 1, roughness: 1},
        {x: 0, y: -3.2, z: -1.5, r: 0.1, g: 0, b: 0, rr: 1, rg: 0.1, rb: 0.1, sr: 1, sg: 0.5, sb: 0.5, roughness: 1},
        {x: -2.5, y: -3.2, z: -1.5, r: 0.5, g: 0.9, b: 0.9, rr: 0, rg: 0, rb: 0, sr: 0, sg: 0, sb: 0, roughness: 1}
    ],
    planes : [
        {x: 0.0, y: 1.0, z: 0, r: 1.0, g: 1.0, b: 1.0, roughness: 1, offset: -4.0, enabled: true, desc: 'floor'},
        {x: 0, y: -1.0, z: 0.0, r: 1.0, g: 1.0, b: 1.0, roughness: 1, offset: 4.0, enabled: true, desc: 'ceiling'},
        {x: -1.0, y: 0.0, z: 0, r: 1.0, g: 0.1, b: 0.1, roughness: 1, offset: 4.0, enabled: true, desc: 'right wall'},
        {x: 1.0, y: 0.0, z: 0, r: 0.1, g: 1.0, b: 0.1, roughness: 1, offset: -4.0, enabled: true, desc: 'left wall'},
        {x: 0, y: 0, z: 1.0, r: 0.9, g: 0.9, b: 0.5, roughness: 0.16, offset: -4.0, enabled: true, desc: 'back wall'},
        {x: 0, y: 0, z: -1.0, r: 1.0, g: 1.0, b: 1.0, roughness: 1, offset: 4.0, enabled: false, desc: 'front wall'}
    ]
}

// Add the inputs to html (note that the event handling is integrated into the elements' onInput -functions)
function addLightInputs(i, lightArr) {
    const container = document.getElementById("lightcontrols");
    const htmlStr = `
        <br>
        <b>light ${i+1}</b><br>
        <input type="checkbox" ${lightArr[i].enabled && "checked"} id="${i}" class="light-enable"> on/off<br>
        <table class="sliders">
            <tr>
                <td><label>Bright:</label></td>
                <td><input type="range" min="0" max="100" step="0.1" value="${lightArr[i].brightness}" id="${i}" class="light-brightness"></td>
            </tr>
            <tr>
                <td><label>Spot size:</label></td>
                <td><input type="range" min="0" max="1" step="0.01" value="${1-lightArr[i].spotSize}" id="${i}" class="light-spotsize"></td>
            </tr>
            <tr>
                <td><label>Spot falloff:</label></td>
                <td><input type="range" min="0" max="4" step="0.01" value="${lightArr[i].spotIntensity}" id="${i}" class="light-spotintensity"></td>
            </tr>
            <tr>
                <td><label>r:</label></td>
                <td><input type="range" min="0" max="1" value="1" step="0.1" id="${i}r" class="light-color"></td>
            </tr>
            <tr>
                <td><label>g:</label></td>
                <td><input type="range" min="0" max="1" value="1" step="0.1" id="${i}g" class="light-color"></td>
            </tr>
            <tr>
                <td><label>b:</label></td>
                <td><input type="range" min="0" max="1" value="1" step="0.1" id="${i}b" class="light-color"></td>
            </tr>
                <td><label>sizeX:</label></td>
                <td><input type="range" min="0" max="3" step="0.01" value="${lightArr[i].sizeX}" id="${i}x" class="light-size"></td>
            <tr>
                <td><label>sizeY:</label></td>
                <td><input type="range" min="0" max="3" step="0.01" value="${lightArr[i].sizeY}" id="${i}y" class="light-size"></td>
            </tr>
        </table>`;
    container.insertAdjacentHTML('beforeend', htmlStr);
}

function addPlaneInputs(i, planeArr) {
    const container = document.getElementById("planecontrols");
    const htmlStr = `
        <input type="checkbox" id="${i}" class="plane-enable" ${planeArr[i].enabled && "checked"}><b>${planeArr[i].desc}</b><br>`;
    container.insertAdjacentHTML('beforeend', htmlStr);
}

for (let i = 0; i < WorldState.lights.length; i++) {
    addLightInputs(i, WorldState.lights);
}

for (let i = 0; i < WorldState.planes.length; i++) {
    addPlaneInputs(i, WorldState.planes);
}