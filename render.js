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
  1000
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

// ------------------------Loaders-------------------------------

let currentMesh = null;
let originalMesh = null;
let cutMesh = null;

// const loader = new GLTFLoader();
// let loadedModel;

// loader.load(
//     'models/gltf/monke_test/Monke.glb',
//     (gltf) => {
//         loadedModel = gltf.scene;
//         scene.add(loadedModel);

//         loadedModel.position.set(0, 0, 0);
//         loadedModel.scale.set(2, 2, 2);

//         let allVertices = [];

//         loadedModel.traverse((child) => {
//             if (child.isMesh && child.geometry) {
//               const vertices = child.geometry.attributes.position.array;

//               for(let i = 0; i < vertices.length; i += 3) {
//                 allVertices.push(new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]));
//               }
//             }
//         });

//     },
//     (xhr) => {
//         console.log((xhr.loaded / xhr.total) * 100 + '% loaded');
//     },
//     (error) => {
//         console.error('An error happened', error);
//     }
// )


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
                color: 0xcc7a00, // Orange-brown monkey color
				wireframe: true,
                side: THREE.DoubleSide
            });
        }
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 0, 0);
        mesh.scale.set(2, 2, 2);
		mesh.rotateX(-90);

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
        "models/ply/cube_test/Cube_cut.ply",
        (geometry) => {
            geometry.computeVertexNormals();
            
            // Use a different material to show it's the cut version
            const cutMaterial = new THREE.MeshStandardMaterial({
                color: 0xff4444, // Red color to distinguish from original
                wireframe: true,
                side: THREE.DoubleSide
            });
            
            cutMesh = new THREE.Mesh(geometry, cutMaterial);
            cutMesh.position.set(0, 0, 0);
            cutMesh.scale.set(2, 2, 2);
            cutMesh.rotateX(-90);
            
            // Remove current mesh and add cut mesh
            scene.remove(currentMesh);
            currentMesh = cutMesh;
            scene.add(currentMesh);
            
            console.log("Cut model loaded successfully!");
        },
        (progress) => {
            console.log("Loading cut model:", (progress.loaded / progress.total) * 100 + "%");
        },
        (error) => {
            console.error("Error loading cut PLY:", error);
            alert("Failed to load cut model: " + error.message);
        }
    );
}
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
	if(!originalMesh) return;
	scene.remove(currentMesh);
	currentMesh = originalMesh;
	scene.add(currentMesh);

	console.log("Reset to original model");
})

//----------------------------------------------------------------------
camera.position.set(0, 3, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth camera movement
controls.dampingFactor = 0.25;
controls.enableZoom = true;

function animate() {
  requestAnimationFrame(animate);

  controls.update();

  renderer.render(scene, camera);
}

animate();