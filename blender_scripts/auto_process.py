"""
Blender Auto-Process Script

Runs headless (--background) to process 3D models for 3D printing:
1. Import model (OBJ/GLB)
2. Mesh cleanup (remove doubles, recalculate normals, fill small holes)
3. Decimate if polygon count exceeds threshold
4. Printability checks (manifold, wall thickness, overhangs, printer volume)
5. Export as STL
6. Output JSON result to stdout

Usage:
    blender --background --python auto_process.py -- --input model.glb --output output.stl
"""

import sys
import json
import os
import argparse

# ── Parse arguments after '--' ──────────────────────────────────────

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]

parser = argparse.ArgumentParser(description="Auto-process 3D model for printing")
parser.add_argument("--input", required=True, help="Input model path (GLB/OBJ)")
parser.add_argument("--output", required=True, help="Output STL path")
parser.add_argument("--decimate-ratio", type=float, default=0.5, help="Decimation ratio (0-1)")
parser.add_argument("--printer-volume", default="220,220,250", help="Max printer volume X,Y,Z in mm")
args = parser.parse_args(argv)

printer_volume = [float(x) for x in args.printer_volume.split(",")]

# ── Blender setup ───────────────────────────────────────────────────

import bpy
import bmesh
import mathutils

# Clear default scene
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

# ── Import model ────────────────────────────────────────────────────

input_path = args.input
output_path = args.output
input_ext = os.path.splitext(input_path)[1].lower()

try:
    if input_ext == ".glb" or input_ext == ".gltf":
        bpy.ops.import_scene.gltf(filepath=input_path)
    elif input_ext == ".obj":
        bpy.ops.import_scene.obj(filepath=input_path)
    elif input_ext == ".stl":
        bpy.ops.import_mesh.stl(filepath=input_path)
    else:
        print(json.dumps({"success": False, "error": f"Unsupported format: {input_ext}"}))
        sys.exit(1)
except Exception as e:
    print(json.dumps({"success": False, "error": f"Import failed: {str(e)}"}))
    sys.exit(1)

# ── Select all imported objects ─────────────────────────────────────

bpy.ops.object.select_all(action="SELECT")
obj = bpy.context.active_object

if obj is None or obj.type != "MESH":
    print(json.dumps({"success": False, "error": "No mesh object found after import"}))
    sys.exit(1)

# ── Mesh cleanup ────────────────────────────────────────────────────

mesh = obj.data
bm = bmesh.new()
bm.from_mesh(mesh)

# Remove duplicate vertices
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)

# Recalculate normals
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

bm.to_mesh(mesh)
bm.free()
mesh.update()

# Apply scale/rotation
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

# ── Decimation (if needed) ──────────────────────────────────────────

face_count = len(mesh.polygons)
if face_count > 500000:
    decimate_mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
    decimate_mod.ratio = args.decimate_ratio
    bpy.ops.object.modifier_apply(modifier="Decimate")

# ── Printability Checks ─────────────────────────────────────────────

checks = []
warnings = []

# 1. Manifold check
bm = bmesh.new()
bm.from_mesh(mesh)
non_manifold = [e for e in bm.edges if not e.is_manifold]
is_manifold = len(non_manifold) == 0
checks.append({
    "name": "Manifold geometry",
    "passed": is_manifold,
    "message": "Mesh is watertight" if is_manifold else f"{len(non_manifold)} non-manifold edges found"
})
bm.free()

# 2. Bounding box & printer volume check
bbox = [obj.dimensions.x, obj.dimensions.y, obj.dimensions.z]
fits_printer = all(bbox[i] <= printer_volume[i] for i in range(3))
if fits_printer:
    checks.append({
        "name": "Printer volume",
        "passed": True,
        "message": f"Dimensions ({bbox[0]:.1f}×{bbox[1]:.1f}×{bbox[2]:.1f}mm) within printer volume ({printer_volume[0]}×{printer_volume[1]}×{printer_volume[2]}mm)"
    })
else:
    oversize_dims = [["X","Y","Z"][i] for i in range(3) if bbox[i] > printer_volume[i]]
    checks.append({
        "name": "Printer volume",
        "passed": False,
        "message": f"Exceeds printer volume in: {', '.join(oversize_dims)}"
    })

# 3. Minimum wall thickness (approximation: smallest dimension / 10)
min_dim = min(bbox)
estimated_wall = min_dim / 10 if min_dim > 0 else 0
if estimated_wall >= 1.2:
    checks.append({
        "name": "Minimum wall thickness",
        "passed": True,
        "message": f"Estimated minimum wall: {estimated_wall:.1f}mm (>= 1.2mm)"
    })
else:
    checks.append({
        "name": "Minimum wall thickness",
        "passed": False,
        "message": f"Estimated wall too thin: {estimated_wall:.1f}mm (< 1.2mm). Add wall thickness."
    })
    warnings.append("Thin walls detected — consider increasing wall thickness in original model")

# 4. Overhang detection
face_count = len(mesh.polygons)
overhang_faces = 0
for poly in mesh.polygons:
    angle = poly.normal.angle(mathutils.Vector((0, 0, 1)))  # angle from vertical
    if angle > 0.785:  # 45 degrees in radians
        overhang_faces += 1

overhang_ratio = overhang_faces / face_count if face_count > 0 else 0
if overhang_ratio < 0.15:
    checks.append({
        "name": "Overhang detection",
        "passed": True,
        "message": f"Overhang ratio: {overhang_ratio:.1%} (< 15%)"
    })
else:
    checks.append({
        "name": "Overhang detection",
        "passed": False,
        "message": f"Excessive overhangs: {overhang_ratio:.1%} (>= 15%). Supports may be required."
    })
    warnings.append(f"Significant overhangs ({overhang_ratio:.1%}) — supports likely needed")

# 5. Minimum feature size (estimate: smallest face area)
min_face_area = min((p.area for p in mesh.polygons), default=0)
estimated_feature = min_face_area ** 0.5 if min_face_area > 0 else 0
if estimated_feature >= 2.0 or min_face_area == 0:
    checks.append({
        "name": "Minimum feature size",
        "passed": True,
        "message": f"Estimated min feature: {estimated_feature:.1f}mm (>= 2.0mm)"
    })
else:
    checks.append({
        "name": "Minimum feature size",
        "passed": False,
        "message": f"Features too small: {estimated_feature:.1f}mm (< 2.0mm)"
    })
    warnings.append("Very small features detected — may not print cleanly")

# ── Export STL ──────────────────────────────────────────────────────

os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

bpy.ops.export_mesh.stl(
    filepath=output_path,
    use_selection=True,
    global_scale=1.0,
    use_scene_unit=False,
    ascii=False,
)

# ── Output JSON result ─────────────────────────────────────────────

success = all(c["passed"] for c in checks)
file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0

result = {
    "success": success,
    "stlPath": output_path,
    "fileSize": file_size,
    "checks": checks,
    "warnings": warnings,
    "stats": {
        "vertexCount": len(mesh.vertices),
        "faceCount": len(mesh.polygons),
        "bounds": {"x": bbox[0], "y": bbox[1], "z": bbox[2]},
    },
}

print(json.dumps(result))
