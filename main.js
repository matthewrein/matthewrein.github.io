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
    'Brazil',
    'Argentina',
    'United Kingdom',
    'France',
    'Germany',
    'India',
    'Australia',
    'Japan'
];

const highlightedCities = [
    { name: 'New York', lat: 40.7128, lon: -74.0060 },
    { name: 'London', lat: 51.5074, lon: -0.1278 },
    { name: 'Paris', lat: 48.8566, lon: 2.3522 },
    { name: 'Tokyo', lat: 35.6895, lon: 139.6917 },
    { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
    { name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729 },
    { name: 'Mumbai', lat: 19.0760, lon: 72.8777 },
    { name: 'San Francisco', lat: 37.7749, lon: -122.4194 },
    { name: 'Austin', lat: 30.2672, lon: -97.7431 }
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
        const oceanColor = 0x303030; // Blue color for the ocean
        const material = new THREE.MeshStandardMaterial({ color: oceanColor });
        const sphere = new THREE.Mesh(geometry, material);
        group.add(sphere);

        const color = 0xffffff; // Soft gray color for the moon
        const intensity = 1;
        // Use only AmbientLight for both live scene and export
        const ambientLight = new THREE.AmbientLight(color, intensity);
        group.add(ambientLight);
        const shadowMesh = createSpotShadowMesh();
        shadowMesh.position.y = - 1.1;
        shadowMesh.position.z = - 0.25;
        shadowMesh.scale.setScalar(2);
        group.add(shadowMesh);


        const gui = new GUI();
        const params = {
            exportUSDZ: exportUSDZ
        };
        gui.add(params, 'exportUSDZ').name('Export USDZ');
        gui.open();

        //load geojson data from file


        const borders = new THREE.Group();
        borders.name = 'borders';

        // Collect all boundary and fill geometries globally
        const highlightedBoundaryGeometries = [];
        const normalBoundaryGeometries = [];
        const allFillGeometries = [];

        for (let i = 0; i < data.features.length; i++) {
            const countryNmae = data.features[i].properties.name;
            const isHighlighted = highlightedCountries.includes(countryNmae);
            if (data.features[i].geometry.type === 'Polygon') {
                drawBoundary([data.features[i].geometry.coordinates], isHighlighted);
            } else if (data.features[i].geometry.type === 'MultiPolygon') {
                drawBoundary(data.features[i].geometry.coordinates, isHighlighted);
            }
        }

        // After all boundaries and fills are collected, merge and add to borders group
        if (normalBoundaryGeometries.length > 0) {
            const mergedNormal = BufferGeometryUtils.mergeGeometries(normalBoundaryGeometries, false);
            borders.add(new THREE.Mesh(
                mergedNormal,
                new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.FrontSide, metalness: 0.7 })
            ));
        }
        if (highlightedBoundaryGeometries.length > 0) {
            const mergedHighlighted = BufferGeometryUtils.mergeGeometries(highlightedBoundaryGeometries, false);
            borders.add(new THREE.Mesh(
                mergedHighlighted,
                new THREE.MeshStandardMaterial({ color: 0x00ff00, side: THREE.FrontSide, metalness: 0.8 })
            ));
        }
        if (allFillGeometries.length > 0) {
            const mergedFills = BufferGeometryUtils.mergeGeometries(allFillGeometries, false);
            borders.add(new THREE.Mesh(
                mergedFills,
                new THREE.MeshStandardMaterial({ color: 0x00ff00, side: THREE.FrontSide, metalness: 0.5 })
            ));
        }

        group.add(borders);

        // After group.add(borders);
        const cityGroup = new THREE.Group();
        highlightedCities.forEach(city => {
            const lat = city.lat * (Math.PI / 180);
            const lon = (city.lon + 180) * (Math.PI / 180);
            const x = Math.cos(lat) * Math.sin(lon);
            const y = Math.sin(lat);
            const z = Math.cos(lat) * Math.cos(lon);
            // Place sphere so it sticks out halfway through the surface
            const surfaceRadius = 50;
            const sphereRadius = 1; // diameter = 2 * 1.2 (from geometry)
            const position = new THREE.Vector3(x, y, z).normalize().multiplyScalar(surfaceRadius + sphereRadius / 2);
            const sphereGeometry = new THREE.SphereGeometry(.5, 16, 16);
            const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, metalness: 0.7, emissive: 0x00ff00, emissiveIntensity: 0.5 });
            const citySphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            citySphere.position.copy(position);
            citySphere.name = city.name;
            citySphere.updateWorldMatrix(true)
            cityGroup.add(citySphere);
        });
        group.add(cityGroup);

        // Define all arcs to be drawn as [from, to]
        const arcs = [
            ['Paris', 'New York'],
            ['Rio de Janeiro', 'New York'],
            ['San Francisco', 'New York'],
            ['Tokyo', 'San Francisco'],
            ['Austin', 'New York'],
            // Germany is not in highlightedCities, so use coordinates
            [{ name: 'Germany', lat: 51.1657, lon: 10.4515 }, 'New York'],
            ['Mumbai', { name: 'Germany', lat: 51.1657, lon: 10.4515 }],
            ['Sydney', 'San Francisco']
        ];

        arcs.forEach(([from, to]) => {
            const fromCity = typeof from === 'string' ? highlightedCities.find(c => c.name === from) : from;
            const toCity = typeof to === 'string' ? highlightedCities.find(c => c.name === to) : to;
            if (fromCity && toCity) {
                const arc = drawArcBetweenCities(
                    fromCity,
                    toCity
                );
                group.add(arc);
            }
        });
        scene.add(group);

        renderer.setAnimationLoop(animate);
        prepUSDZ();



        function animate() {
            var delta = clock.getDelta();

            // Rotate the whole group (scen

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
            const thickness = isHighlighted ? 0.1 : 0.05;
            polygons.forEach(polygon => {
                polygon.forEach(ring => {
                    // Skip small islands (rings with too few points)
                    if (ring.length < 100) return;
                    const [points, flatCoords] = generatePointsAndFlatCoords(ring, isHighlighted);
                    const curve = new THREE.CatmullRomCurve3([
                        ...points,
                        points[0]
                    ]);
                    curve.closed = true;

                    const minSegments = 32;
                    const maxSegments = 256;
                    const segments = Math.min(maxSegments, Math.max(minSegments, Math.round(points.length * 4)));
                    const tubeGeometry = new THREE.TubeGeometry(
                        curve,
                        segments,
                        thickness,
                        2,
                        true
                    );

                    // Only add valid geometries
                    if (tubeGeometry && tubeGeometry.index && tubeGeometry.getAttribute('position').count > 0) {
                        if (isHighlighted) {
                            highlightedBoundaryGeometries.push(tubeGeometry);
                        } else {
                            normalBoundaryGeometries.push(tubeGeometry);
                        }
                    }

                    if (isHighlighted) {
                        const fillMesh = generateFillMesh(points, flatCoords);
                        if (fillMesh.geometry && fillMesh.geometry.index && fillMesh.geometry.getAttribute('position').count > 0) {
                            allFillGeometries.push(fillMesh.geometry);
                        }
                    }
               });

            })
        }

        function generatePointsAndFlatCoords(ring, isHighlighted) {
            const offset = isHighlighted ? 0.4 : 0; // Offset for highlighted countries
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
                opacity: 1,
                metalness: 0.7
            });

            const fillMesh = new THREE.Mesh(fillGeometry, fillMaterial);
            fillMesh.renderOrder = -1;
            fillMesh.userData = { isHighlightFill: true };

            return fillMesh;
        }

        function drawArcBetweenCities(cityA, cityB, options = {}) {
            // Default options
            const {
                color = 0x00ff00, // green
                thickness = 0.1,
                height = 4, // lower height for earth-following arc
                segments = 128,
                metalness = 0.5,
                opacity = 0.5 // slightly transparent
            } = options;

            // Convert lat/lon to radians
            const latA = cityA.lat * (Math.PI / 180);
            const lonA = (cityA.lon + 180) * (Math.PI / 180);
            const latB = cityB.lat * (Math.PI / 180);
            const lonB = (cityB.lon + 180) * (Math.PI / 180);

            // Globe radius
            const r = 50;
            // Start and end points on the globe
            const start = new THREE.Vector3(
                Math.cos(latA) * Math.sin(lonA),
                Math.sin(latA),
                Math.cos(latA) * Math.cos(lonA)
            ).normalize().multiplyScalar(r);
            const end = new THREE.Vector3(
                Math.cos(latB) * Math.sin(lonB),
                Math.sin(latB),
                Math.cos(latB) * Math.cos(lonB)
            ).normalize().multiplyScalar(r);

            // Create multiple control points for a smoother, earth-following arc
            const points = [];
            const numPoints = 5;
            for (let i = 0; i <= numPoints; i++) {
                const t = i / numPoints;
                // Slerp between start and end
                const interp = start.clone().lerp(end, t).normalize();
                // Raise the arc slightly above the globe, peaking at the midpoint
                const arcHeight = r + Math.sin(Math.PI * t) * height;
                points.push(interp.multiplyScalar(arcHeight));
            }
            const curve = new THREE.CatmullRomCurve3(points);

            // Tube geometry along the curve
            const tubeGeometry = new THREE.TubeGeometry(curve, segments, thickness, 8, false);
            const tubeMaterial = new THREE.MeshStandardMaterial({ color, metalness, transparent: true, opacity,  emissive: 0x00ff00, emissiveIntensity: 1 });
            const arcMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
            return arcMesh;
        }



    });


