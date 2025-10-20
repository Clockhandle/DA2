import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x808080);

const camera = new THREE.PerspectiveCamera(
  75, // Fov
  window.innerWidth / window.innerHeight,
  0.1,
  5000
);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.position = "absolute";
renderer.domElement.style.top = "0";
renderer.domElement.style.left = "0";
renderer.domElement.style.zIndex = "0";
document.body.appendChild(renderer.domElement);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 5);
directionalLight.castShadow = true;

directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;

scene.add(directionalLight);

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

let flying = false;
let flyingDirections = [];
let flyingSpeed = 5.0; // Adjust for faster/slower movement

// ------------------------Loaders-------------------------------

let currentMesh = null;
let originalMesh = null;
let cutMesh = null;


const loader = new PLYLoader();

loader.load(
    "models/ply/cube_test/Cube.ply",
    (geometry) => {
        geometry.computeVertexNormals();
        
        let material;
        
        // Check if the geometry has vertex colors
        if (geometry.attributes.color) {
            material = new THREE.MeshStandardMaterial({
                vertexColors: true,
                side: THREE.DoubleSide
            });
        } 
		else {
            // Fallback to a nice color
            material = new THREE.MeshStandardMaterial({
                color: 0xcc7a00, // Orange-brown
				wireframe: true,
                side: THREE.DoubleSide
            });
        }
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 0, 0);
        mesh.scale.set(2, 2, 2);

		originalMesh = mesh;
		currentMesh = mesh;

        scene.add(mesh);
    },
    (progress) => {
        console.log("Loading progress:", (progress.loaded / progress.total) * 100 + "%");
    },
    (error) => {
        console.error("Error loading PLY: ", error);
    }
);

function loadCutModel() {
    const cutLoader = new PLYLoader();

    cutLoader.load(
        "models/ply/cube_test/Cube_tetrahedra.ply",
        (geometry) => {
            geometry.computeVertexNormals();

            // Load the .tet file for tetrahedron indices
            fetch("models/ply/cube_test/Cube_tetrahedra.tet")
                .then(response => response.text())
                .then(text => {
                    // Remove previous cutMesh if exists
                    if (cutMesh) scene.remove(cutMesh);

                    const positions = geometry.attributes.position.array;
                    const tetraGroup = new THREE.Group();

                    const lines = text.trim().split('\n');
                    const numTetrahedra = parseInt(lines[0]);
                    for (let i = 1; i <= numTetrahedra; i++) {
                        const [v1, v2, v3, v4] = lines[i].split(' ').map(Number);

                        // Get the 4 vertices
                        const verts = [
                            positions[v1 * 3], positions[v1 * 3 + 1], positions[v1 * 3 + 2],
                            positions[v2 * 3], positions[v2 * 3 + 1], positions[v2 * 3 + 2],
                            positions[v3 * 3], positions[v3 * 3 + 1], positions[v3 * 3 + 2],
                            positions[v4 * 3], positions[v4 * 3 + 1], positions[v4 * 3 + 2],
                        ];

                        // Each tetrahedron has 4 triangular faces
                        const indices = [
                            0, 1, 2,
                            0, 1, 3,
                            0, 2, 3,
                            1, 2, 3
                        ];

                        const tetraGeometry = new THREE.BufferGeometry();
                        tetraGeometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
                        tetraGeometry.setIndex(indices);
                        tetraGeometry.computeVertexNormals();

                        const tetraMesh = new THREE.Mesh(
                            tetraGeometry,
                            new THREE.MeshStandardMaterial({ color: 0xff4444, wireframe: true, side: THREE.DoubleSide })
                        );
                        // Do NOT randomize position here!
                        tetraGroup.add(tetraMesh);
                    }

                    tetraGroup.scale.set(2, 2, 2);
                    tetraGroup.rotateX(-Math.PI / 2);

                    cutMesh = tetraGroup;
                    scene.add(cutMesh);
                    currentMesh = cutMesh;

                    // Remove the original cube from the scene
                    if (originalMesh) {
                        scene.remove(originalMesh); // This removes the original cube from the scene
                        // or: originalMesh.visible = false; // This just hides it, but keeps it in the scene
                    }

                    console.log("Tetrahedra model loaded in original positions!");
                });
        },
        (progress) => {
            console.log("Loading tetrahedra model:", (progress.loaded / progress.total) * 100 + "%");
        },
        (error) => {
            console.error("Error loading tetrahedra PLY:", error);
            alert("Failed to load tetrahedra model: " + error.message);
        }
    );
}

const explosionCenter = new THREE.Vector3(0, 0, 0); // You can adjust this
const sphereGeometry = new THREE.SphereGeometry(5, 32, 32);
const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const explosionSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
explosionSphere.position.copy(explosionCenter);
scene.add(explosionSphere);
//-------------------------------------------------------------

//--------------------------Button Events-------------------------------

document.getElementById("cutModelBtn").addEventListener("click", async () => {
    if(!originalMesh) return;

    try {
        const response = await fetch("http://localhost:3000/api/run-tetgen", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });

        const result = await response.json();

        if(result.success) {
            console.log("Tetgen success");
            console.log("Output: ", result.output);
            
            // Load the generated cut model
            loadCutModel();
            
        } else {
            console.error("Tetgen failed: ", result.error);
            alert(`Tetgen failed: "${result.error}"`);
        }
    } catch (error) {
        console.log("Server communication error: ", error);
        alert(`Server error: ${error.message}`);
    }
});

document.getElementById("resetModelBtn").addEventListener("click", () => {
    // Stop flying animation and clear directions
    flying = false;
    flyingDirections = [];

    // Remove cut mesh if present
    if (cutMesh) {
        scene.remove(cutMesh);
        cutMesh = null;
    }

    // Show the original mesh
    if (originalMesh && !scene.children.includes(originalMesh)) {
        scene.add(originalMesh);
    }
    currentMesh = originalMesh;

    console.log("Reset to original model");
});

document.getElementById("scrambleModelBtn").addEventListener("click", () => {
    if (cutMesh) {
        scrambleAllTetrahedraPositions();
    } else {
        scrambleModelPosition(currentMesh || originalMesh);
    }
});

function scrambleModelPosition(mesh) {
    if (!mesh) return;
    mesh.position.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
    );
}

function scrambleAllTetrahedraPositions() {
    if (!cutMesh) return;
    const count = cutMesh.children.length;
    const radius = 150; // Increased radius for more separation
    cutMesh.children.forEach((tetra, i) => {
        const angle = (i / count) * Math.PI * 2;
        tetra.position.set(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
            0
        );
    });
}

document.getElementById("randomizeFlyingBtn").addEventListener("click", () => {
    if (!cutMesh) return;
    flying = true;
    flyingDirections = [];
    cutMesh.children.forEach((tetra) => {
        // Calculate the center of the tetrahedron geometry
        const posAttr = tetra.geometry.getAttribute('position');
        let center = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < posAttr.count; i++) {
            center.add(new THREE.Vector3(
                posAttr.getX(i),
                posAttr.getY(i),
                posAttr.getZ(i)
            ));
        }
        center.multiplyScalar(1 / posAttr.count);

        // Direction from explosion center to tetrahedron center
        const dir = center.clone().sub(explosionCenter).normalize();
        flyingDirections.push(dir);
    });
});

//----------------------------------------------------------------------
camera.position.set(0, 3, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth camera movement
controls.dampingFactor = 0.25;
controls.enableZoom = true;

function animate() {
    requestAnimationFrame(animate);

    controls.update();

    // Flying animation
    if (flying && cutMesh && flyingDirections.length === cutMesh.children.length) {
        cutMesh.children.forEach((tetra, i) => {
            tetra.position.add(flyingDirections[i].clone().multiplyScalar(flyingSpeed));
        });
    }

    renderer.render(scene, camera);
}

animate();



