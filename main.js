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
        gui.add(params, 'exportUSDZ').name('Export USDZ v5');
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
                    boundaries.add(tube);
                    
                    if(isHighlighted) {
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



        function generateFillMesh(points, flatCoords){
            const scale = 50.4;

            // Ensure boundary points are at correct height
            const boundaryPoints = points.map(point => {
                return point.clone().normalize().multiplyScalar(scale);
            });

            // Create initial geometry from boundary points
            const vertices = new Float32Array(boundaryPoints.length * 3);
            boundaryPoints.forEach((point, i) => {
                vertices[i * 3] = point.x;
                vertices[i * 3 + 1] = point.y;
                vertices[i * 3 + 2] = point.z;
            });

            // Create triangulation
            const triangles = earcut(flatCoords, null, 2);

            // Create geometry
            const fillGeometry = new THREE.BufferGeometry();
            fillGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            fillGeometry.setIndex(triangles);

            // Subdivide manually by adding midpoints
            const positions = fillGeometry.attributes.position.array;
            const indices = fillGeometry.index.array;
            const newPositions = [];
            const newIndices = [];

            // Process each triangle
            for (let i = 0; i < indices.length; i += 3) {
                const a = indices[i] * 3;
                const b = indices[i + 1] * 3;
                const c = indices[i + 2] * 3;

                // Original vertices
                const v1 = new THREE.Vector3(positions[a], positions[a + 1], positions[a + 2]);
                const v2 = new THREE.Vector3(positions[b], positions[b + 1], positions[b + 2]);
                const v3 = new THREE.Vector3(positions[c], positions[c + 1], positions[c + 2]);

                // Calculate midpoints
                const v12 = v1.clone().add(v2).multiplyScalar(0.5).normalize().multiplyScalar(scale);
                const v23 = v2.clone().add(v3).multiplyScalar(0.5).normalize().multiplyScalar(scale);
                const v31 = v3.clone().add(v1).multiplyScalar(0.5).normalize().multiplyScalar(scale);

                // Add all vertices
                const idx = newPositions.length / 3;
                newPositions.push(
                    v1.x, v1.y, v1.z,
                    v2.x, v2.y, v2.z,
                    v3.x, v3.y, v3.z,
                    v12.x, v12.y, v12.z,
                    v23.x, v23.y, v23.z,
                    v31.x, v31.y, v31.z
                );

                // Create four triangles
                newIndices.push(
                    idx, idx + 3, idx + 5,     // v1, v12, v31
                    idx + 3, idx + 1, idx + 4, // v12, v2, v23
                    idx + 5, idx + 4, idx + 2, // v31, v23, v3
                    idx + 3, idx + 4, idx + 5  // v12, v23, v31
                );
            }

            const subdivGeometry = new THREE.BufferGeometry();
            subdivGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
            subdivGeometry.setIndex(newIndices);
            subdivGeometry.computeVertexNormals();

            // Create a group to hold both the fill mesh and debug wireframe
            const group = new THREE.Group();
            group.userData = { isHighlightFill: true };

            // Create the fill mesh
            const fillMaterial = new THREE.MeshStandardMaterial({
                color: 0x003f00,
                side: THREE.FrontSide,
                transparent: true,
                opacity: 0.6,
                depthWrite: false,
                depthTest: true
            });

            const fillMesh = new THREE.Mesh(subdivGeometry, fillMaterial);
            fillMesh.renderOrder = -1;
            group.add(fillMesh);


            return group;
        };
    });


