import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import earcut from 'earcut';

const highlightedCountries = [
    'United States of America',
    'Canada',
    'Mexico',
    'Brazil',
    'Argentina',
    'United Kingdom',
    'France',
    'Germany',
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
        gui.add(params, 'exportUSDZ').name('Export USDZ v7');
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

            const boundaries = new THREE.Group();
            const fills = new THREE.Group();
            polygons.forEach(polygon => {
                polygon.forEach(ring => {
                    const [points, flatCoords] = generatePointsAndFlatCoords(ring, isHighlighted);
                    const curve = new THREE.CatmullRomCurve3([
                        ...points,
                        points[0] // Close the loop
                    ]);
                    curve.closed = true;

                    // // Create tube geometry around the curve
                    // Create a plane that 
                    const tubeGeometry = new THREE.TubeGeometry(
                        curve,
                        Math.round(points.length / 4),
                        thickness,
                        2,
                        true // closed
                    );

                    const tubeMaterial = new THREE.MeshStandardMaterial({
                        color: color,
                        side: THREE.FrontSide,
                    });

                    const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
                    boundaries.add(tube);

                    if (isHighlighted) {
                        const fillMesh = generateFillMesh(points, flatCoords);
                        fillMesh.position.set(0, 0, 0);
                        // console.log(fillMesh);
                        fills.add(fillMesh);
                    }

                });

            })
            const result = BufferGeometryUtils.mergeGeometries(boundaries.children.map(c => c.geometry), false);
            borders.add(new THREE.Mesh(result, new THREE.MeshStandardMaterial({ color: color, side: THREE.FrontSide })));
            borders.add(fills);
        }

        function generatePointsAndFlatCoords(ring, isHighlighted) {
            const offset = isHighlighted ? 0.25 : 0; // Offset for highlighted countries
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
        function generateFillMesh(points, flatCoords) {
            const scale = 50.4;

            // Ensure boundary points are at correct height
            const boundaryPoints = points.map(point => {
                return point.clone().normalize().multiplyScalar(scale);
            });

            // Create initial geometry from boundary points
            const vertices = boundaryPoints.map(p => p.clone());
            const triangles = earcut(flatCoords, null, 2);

            // Subdivision: for each triangle, add midpoints and create 4 new triangles
            const midpointCache = {};
            function getMidpointIndex(i1, i2) {
                const key = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;
                if (midpointCache[key] !== undefined) return midpointCache[key];
                const mid = vertices[i1].clone().add(vertices[i2]).multiplyScalar(0.5).normalize().multiplyScalar(scale);
                vertices.push(mid);
                midpointCache[key] = vertices.length - 1;
                return midpointCache[key];
            }

            const newIndices = [];
            for (let i = 0; i < triangles.length; i += 3) {
                const a = triangles[i];
                const b = triangles[i + 1];
                const c = triangles[i + 2];
                const ab = getMidpointIndex(a, b);
                const bc = getMidpointIndex(b, c);
                const ca = getMidpointIndex(c, a);
                // 4 new triangles
                newIndices.push(a, ab, ca);
                newIndices.push(b, bc, ab);
                newIndices.push(c, ca, bc);
                newIndices.push(ab, bc, ca);
            }

            // Convert vertices to Float32Array
            const flatVerts = new Float32Array(vertices.length * 3);
            vertices.forEach((v, i) => {
                flatVerts[i * 3] = v.x;
                flatVerts[i * 3 + 1] = v.y;
                flatVerts[i * 3 + 2] = v.z;
            });

            const fillGeometry = new THREE.BufferGeometry();
            fillGeometry.setAttribute('position', new THREE.BufferAttribute(flatVerts, 3));
            fillGeometry.setIndex(newIndices);
            fillGeometry.computeVertexNormals();

            const fillMaterial = new THREE.MeshStandardMaterial({
                color: 0x003f00,
                side: THREE.FrontSide,
                transparent: true,
                opacity: 0.6,
                depthWrite: false,
                depthTest: true
            });

            const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
            fillMesh.renderOrder = -1;
            fillMesh.userData = { isHighlightFill: true };

            return fillMesh;
        }



    });


