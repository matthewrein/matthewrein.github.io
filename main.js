import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { thickness } from 'three/tsl';

const highlightedCountries = [
    'United States of America',
    'Canada',
    'Mexico',
    'Brazil',
    'Argentina',
    'United Kingdom',
    'France',
    'Germany',
    'Russia',
    'China',
    'India',
    'Australia'
];

fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
    .then(async (response) => {
        const data = await response.json()

        const renderer = new THREE.WebGLRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 1000);
        camera.position.set(100, 100, 100);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 0, 0)
        controls.update();
        const clock = new THREE.Clock();
        const scene = new THREE.Scene();



        const group = new THREE.Group();
        group.name = 'export';


        const geometry = new THREE.SphereGeometry(50, 50, 50);
        const oceanColor = 0x000000; // Blue color for the ocean
        const material = new THREE.MeshStandardMaterial({ color: oceanColor });
        const sphere = new THREE.Mesh(geometry, material);
        group.add(sphere);

        const color = 0xffffff; // Soft gray color for the moon
        const intensity = 10;
        const light = new THREE.AmbientLight(color, intensity);
        group.add(light);
        const shadowMesh = createSpotShadowMesh();
        shadowMesh.position.y = - 1.1;
        shadowMesh.position.z = - 0.25;
        shadowMesh.scale.setScalar(2);
        group.add(shadowMesh);


        const gui = new GUI();
        const params = {
            exportUSDZ: exportUSDZ
        };
        gui.add(params, 'exportUSDZ').name('Export USDZ v4');
        gui.open();

        //load geojson data from file


        const borders = new THREE.Group();
        borders.name = 'borders';


        for (let i = 0; i < data.features.length; i++) {
            const countryNmae = data.features[i].properties.name;
            const isHighlighted = highlightedCountries.includes(countryNmae);
            if (data.features[i].geometry.type === 'Polygon') {
                drawBoundary([data.features[i].geometry.coordinates], isHighlighted);
            } else if (data.features[i].geometry.type === 'MultiPolygon') {
                drawBoundary(data.features[i].geometry.coordinates, isHighlighted);
            }
        }


        group.add(borders);
        scene.add(group);


        renderer.setAnimationLoop(animate);
        prepUSDZ();



        function animate() {
            var delta = clock.getDelta();

            controls.update(delta);
            renderer.render(scene, camera);
        }

        async function prepUSDZ(clip) {
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
            const material = new THREE.MeshStandardMaterial({
                map: shadowTexture, blending: THREE.MultiplyBlending, toneMapped: false
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = - Math.PI / 2;

            return mesh;

        }
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });


        function drawBoundary(polygons, isHighlighted) {
            const color = isHighlighted ? 0x006f00 : 0x6f6f6f; // Red for highlighted countries, green for others
            const thickness = isHighlighted ? 0.1 : 0.05; // Thicker for highlighted countries, thinner for others
   
            const boudnaries = new THREE.Group();
            polygons.forEach(polygon => {
                polygon.forEach(ring => {
                    const [points,] = generatePointsAndFlatCoords(ring, isHighlighted);
                    const curve = new THREE.CatmullRomCurve3([
                        ...points,
                        points[0] // Close the loop
                    ]);
                    curve.closed = true;

                    // // Create tube geometry around the curve
                    // Create a plane that 
                    const tubeGeometry = new THREE.TubeGeometry(
                        curve,
                        points.length,
                        thickness,
                        2,
                        true // closed
                    );

                    const tubeMaterial = new THREE.MeshStandardMaterial({
                        color: color,
                        side: THREE.FrontSide,
                    });

                    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
                    boudnaries.add(tube);

                });
            })
            const result = BufferGeometryUtils.mergeGeometries(boudnaries.children.map(c => c.geometry), false);
            borders.add(new THREE.Mesh(result, new THREE.MeshStandardMaterial({ color: color, side: THREE.FrontSide })));
        }

        function generatePointsAndFlatCoords(ring, isHighlighted) {
            const offset = isHighlighted ? 0.01 : 0; // Offset for highlighted countries
            const points = [];  // Initialize points array  
            const flatCoords = []; // For earcut triangulation
            // Convert coordinates to 3D points
            ring.forEach(coord => {
                const lat = coord[1] * (Math.PI / 180);
                const lon = (coord[0] + 180) * (Math.PI / 180);
                const x = Math.cos(lat) * Math.sin(lon);
                const y = Math.sin(lat);
                const z = Math.cos(lat) * Math.cos(lon);
                const position = new THREE.Vector3(x, y, z).normalize().multiplyScalar(50 + offset); // Scale to sphere radius
                points.push(position);
                flatCoords.push(lon, lat);

            });

            return [points, flatCoords];
        }




    });
