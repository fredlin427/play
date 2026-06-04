"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

interface ThreeViewerProps {
  modelUrl: string | null;
  className?: string;
}

export function ThreeViewer({ modelUrl, className }: ThreeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 400;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(5, 5, 10);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.8);
    d1.position.set(1, 1, 1);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.3);
    d2.position.set(-1, -0.5, -0.5);
    scene.add(d2);

    // Grid
    scene.add(new THREE.GridHelper(10, 20));

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Load model
    if (modelUrl) {
      const ext = modelUrl.split(".").pop()?.toLowerCase();
      let loader: STLLoader | GLTFLoader | OBJLoader;

      if (ext === "stl") {
        loader = new STLLoader();
        (loader as STLLoader).load(modelUrl, (geometry) => {
          const material = new THREE.MeshPhongMaterial({ color: 0x4a90d9, specular: 0x111111, shininess: 30 });
          const mesh = new THREE.Mesh(geometry, material);
          geometry.computeBoundingBox();
          const center = geometry.boundingBox?.getCenter(new THREE.Vector3());
          if (center) mesh.position.sub(center);
          scene.add(mesh);
          fitCamera(camera, controls, geometry.boundingBox!);
        });
      } else if (ext === "glb" || ext === "gltf") {
        loader = new GLTFLoader();
        (loader as GLTFLoader).load(modelUrl, (gltf) => {
          scene.add(gltf.scene);
          const box = new THREE.Box3().setFromObject(gltf.scene);
          fitCamera(camera, controls, box);
        });
      } else if (ext === "obj") {
        loader = new OBJLoader();
        (loader as OBJLoader).load(modelUrl, (obj) => {
          scene.add(obj);
          const box = new THREE.Box3().setFromObject(obj);
          fitCamera(camera, controls, box);
        });
      }
    }

    // Animation loop
    let animId: number;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl]);

  return <div ref={containerRef} className={className || "min-h-[400px] w-full rounded-lg border"} />;
}

function fitCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, box: THREE.Box3) {
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const center = new THREE.Vector3();
  box.getCenter(center);

  camera.position.set(maxDim * 1.5, maxDim, maxDim * 2);
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
}
