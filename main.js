import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { FACETS } from './data';
import { GLTFExporter } from 'three/examples/jsm/Addons.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const FACETS_NAME = 'facets'
const NINTY_DEGREES = THREE.MathUtils.degToRad(90);
const ANGLE = 30


const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);


const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
camera.position.set(500, 500, 500);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 250, 0)
controls.update();

const clock = new THREE.Clock();
const scene = new THREE.Scene();

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.background = new THREE.Color(0xf0f0f0);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const fontLoader = new FontLoader();
let mixer;
const facets = FACETS;

const DEFAULT_CONFIG = {
    scale: 1000,
    showGridX: true,
    showGridY: true,
    showGridZ: true,
    showLabelX: true,
    showLabelY: true,
    showLabelZ: true,
    resolutionX: 10,
    resolutionY: 10,
    resolutionZ: 10,
    chartOffset: 250,
    spehereSize: 5
}


fontLoader.load('./Roboto_Regular.json', function (font) {
    const group = new THREE.Group();
    group.name = 'export'

    const dev = createSphere(new THREE.Vector3(0, 0, 0), 0xFFFFFF, 8)
    dev.name = 'dev'
    group.add(dev)

    const facetLines = createFacetLines(facets, new THREE.Vector3(0, 0, 0), DEFAULT_CONFIG)
    group.add(facetLines)

    group.updateWorldMatrix(false, true)
    const color = 0x3b3b3b3;
    const intensity = 2;
    const light = new THREE.DirectionalLight(color, intensity);
    group.add(light);
    scene.add(group)

    renderGrid()

    const shadowMesh = createSpotShadowMesh();
    shadowMesh.position.y = - 1.1;
    shadowMesh.position.z = - 0.25;
    shadowMesh.scale.setScalar(2);
    scene.add(shadowMesh);

    const params = {
        exportUSDZ: exportUSDZ
    };
    const gui = new GUI();
    gui.add(params, 'exportUSDZ').name('Export USDZ v10');
    gui.open();
    // exportGLB(clip);
    renderer.setAnimationLoop(animate);
    prepUSDZ();
})

function animate() {
    var delta = clock.getDelta();
    if (mixer) {
        // mixer.update(delta);
    }
    controls.update(delta);
    renderer.render(scene, camera);
}


export async function prepUSDZ(clip) {
    const exporter = new USDZExporter();
    const s = scene.getObjectByName('export')
    s.name = 'Scene'
    s.matrixWorldNeedsUpdate = false
    const arraybuffer = await exporter.parseAsync(s);
    const blob = new Blob([arraybuffer], { type: 'application/octet-stream' });

    const link = document.getElementById('link');
    link.href = URL.createObjectURL(blob);
}

function exportUSDZ() {

    const link = document.getElementById('link');
    link.click();

}


function exportGLB(clip) {
    const exporter = new GLTFExporter();
    exporter.parse(
        scene,
        function (result) {
            saveArrayBuffer(result, 'scene.glb');

        },
        function (err) {
            console.log(err)
        },
        {
            binary: true,
            animations: [clip]
        }
    );
}

function saveArrayBuffer(buffer, filename) {
    save(new Blob([buffer], { type: 'application/octet-stream' }), filename);
}

function save(blob, filename) {
    const link = document.getElementById('link');
    link.download = 'scene.glb'
    link.href = URL.createObjectURL(blob);

    // URL.revokeObjectURL( url ); breaks Firefox...
}

export function createFacetLines(data, initialPosition, gridConfig) {
    const {
        scale,
        spehereSize
    } = gridConfig


    const facets = new THREE.Group();
    facets.name = FACETS_NAME;

    for (let i = 0; i < data.length; i++) {
        const facet = new THREE.Group();
        facet.name = data[i].name;

        data[i].spherePositions = []
        const color = new THREE.Color(0xffffff);
        color.setHex(Math.random() * 0xffffff);
        data[i].color = color;

        for (let h = 0; h < data[i].horizontal.length; h++) {

            // CALCULATE POSITION ELEMENTS
            const position = new THREE.Vector3();
            const radius = data[i].horizontal[h] * 50;
            const theta = THREE.MathUtils.degToRad(i * ANGLE)
            const height = data[i].vertical[h] * 100
            // BUILD POSITON
            position.setFromSphericalCoords(radius, NINTY_DEGREES, theta)

            // DRAW GEOMETRY (TEMP)
            const sphere = createSphere(position, data[i].color);
            // NEED to figure out how to update sphere y
            sphere.translateY(height)

            // const line = createLine(sphere.position, initialPosition, data[i].color) // will need to be redrawn each frame?

            data[i].spherePositions.push(sphere.position)

            facet.add(sphere)
        }

        const sphere = createSphere(data[i].spherePositions[0], data[i].color);
        const splinePoints = generateSplinePoints(data[i].spherePositions);
        const line = createSpline(splinePoints, data[i].color);
        facet.add(sphere)
        facet.add(line)
        facets.add(facet)
    }
    return facets;
}

function createSphere(position, color, size = 2) {
    const geometry = new THREE.SphereGeometry(size, 50, 50);
    const material = new THREE.MeshStandardMaterial({ color: color });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.translateX(position.x);
    sphere.translateY(position.y);
    sphere.translateZ(position.z);
    return sphere
}



function generateSplinePoints(points) {
    const splineCurve = new THREE.CatmullRomCurve3(points)
    const resolution = 50;
    const splinePoints = []
    for (let i = 0; i <= resolution; i++) {
        const target = i / resolution;
        splinePoints.push(splineCurve.getPoint(target))
    }
    return splinePoints
}

function createSpline(points, color) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, points.length * 5, 1, 8, false);
    const material = new THREE.MeshStandardMaterial({ color: color });
    const line = new THREE.Mesh(geometry, material);
    return line
}

function renderGrid() {
    const size = 500;
    const divisions = 10;
    const xyPlane = new THREE.GridHelper(size, divisions, 0x000077, 0x3b3b3b);
    const yzPlane = new THREE.GridHelper(size, divisions, 0x007700, 0x3b3b3b);
    const xzPlane = new THREE.GridHelper(size, divisions, 0x770000, 0x3b3b3b);
    yzPlane.rotateOnAxis(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(90))
    yzPlane.translateY(250)
    yzPlane.translateX(250)
    xzPlane.rotateOnAxis(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(90))
    xzPlane.translateZ(-250)
    xzPlane.translateY(-250)
    scene.add(xyPlane);
    scene.add(yzPlane);
    scene.add(xzPlane);
}

function createSpotShadowMesh() {

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;

    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width / 2);
    gradient.addColorStop(0.1, 'rgba(130,130,130,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,1)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const shadowTexture = new THREE.CanvasTexture(canvas);

    const geometry = new THREE.PlaneGeometry();
    const material = new THREE.MeshBasicMaterial({
        map: shadowTexture, blending: THREE.MultiplyBlending, toneMapped: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = - Math.PI / 2;

    return mesh;

}