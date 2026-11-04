"""Original-authored fixture data; not a ContentMapDefinition serializer or loader.

Python standard library only. Run with --check to compare committed bytes and run
small structural geometry checks. No engine, renderer, disc, network or install.
"""

import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import struct


HERE = Path(__file__).resolve().parent
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def encoded(value):
    return (json.dumps(value, indent=2, allow_nan=False) + "\n").encode("utf-8")


def box_faces(lo, hi):
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    # Counter-clockwise from outside; all quads have an outward unit normal.
    return [
        ("west", [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]),
        ("east", [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]),
        ("bottom", [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]),
        ("top", [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]),
        ("north", [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]),
        ("south", [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]]),
    ]


def floor_rect(x0, x1, z0, z1, y=0):
    return [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]]


def source():
    walls = [
        {"id": "wall-west", "min": [-20.5, 0, -16.5], "max": [-20, 4, 16.5], "color": [0.18, 0.38, 0.68, 1]},
        {"id": "wall-east", "min": [20, 0, -16.5], "max": [20.5, 4, 16.5], "color": [0.77, 0.35, 0.13, 1]},
        {"id": "wall-north", "min": [-20, 0, -16.5], "max": [20, 4, -16], "color": [0.36, 0.43, 0.48, 1]},
        {"id": "wall-south", "min": [-20, 0, 16], "max": [20, 4, 16.5], "color": [0.36, 0.43, 0.48, 1]},
        {"id": "divider", "min": [-0.5, 0, -8], "max": [0.5, 3, 8], "color": [0.74, 0.69, 0.51, 1]},
    ]
    polygons = [{"id": "floor", "owner": "courtyard-floor", "role": "floor", "region": "courtyard", "vertices": floor_rect(-20, 20, -16, 16)}]
    for wall in walls:
        for face, vertices in box_faces(wall["min"], wall["max"]):
            polygons.append({"id": f"{wall['id']}-{face}", "owner": wall["id"], "role": "wall", "region": "courtyard", "vertices": vertices})
    return {
        "fixtureFormat": "neutral-authoring-source-1",
        "id": "original-courtyard",
        "label": "Original courtyard fixture",
        "status": "fixture preparation; typed adapter and engine acceptance pending",
        "provenance": {
            "kind": "original-authored browser adaptation",
            "method": "Geometric rectangles and boxes created by generate.py for this fixture.",
            "discContent": False, "externalAssets": False, "externalFetch": False,
        },
        "coordinates": {
            "unit": "metre", "metersPerUnit": 1, "up": "+Y", "handedness": "right",
            "north": "-Z", "east": "+X", "transformsBaked": True, "scale": [1, 1, 1],
            "note": "All source and GLB positions are metres. Runtime conversion awaits the published adapter.",
        },
        "bounds": {"min": [-20.5, 0, -16.5], "max": [20.5, 4, 16.5]},
        "render": {
            "file": "courtyard.glb", "floorColor": [0.27, 0.31, 0.29, 1],
            "wallBoxes": walls,
            "visualOnlyMarkers": [
                {"id": "pickup-marker", "vertices": floor_rect(-0.5, 0.5, -12.5, -11.5, 0.01), "color": [0.85, 0.76, 0.15, 1]},
                {"id": "site-a-marker", "vertices": floor_rect(13, 15, -1, 1, 0.01), "color": [0.18, 0.38, 0.68, 1]},
                {"id": "site-b-marker", "vertices": floor_rect(-15, -13, -1, 1, 0.01), "color": [0.77, 0.35, 0.13, 1]},
            ],
        },
        "collision": {"polygons": polygons, "note": "Explicit convex planar quads. Floor is walkable; all six faces of every wall box are wall surfaces, including tops/bottoms."},
        "regions": [
            {"id": "courtyard", "label": "Courtyard", "min": [-20, 0, -16], "max": [20, 4, 16]},
            {"id": "west-staging", "label": "West staging", "min": [-18, 0, -5], "max": [-10, 4, 5]},
            {"id": "east-staging", "label": "East staging", "min": [10, 0, -5], "max": [18, 4, 5]},
            {"id": "north-route", "label": "North route", "min": [-4, 0, -14], "max": [4, 4, -10]},
            {"id": "south-route", "label": "South route", "min": [-4, 0, 10], "max": [4, 4, 14]},
        ],
        "spawns": [
            {"id": "spawn-a-0", "team": "A", "position": [-15, 0, -3], "facing": [1, 0, 0], "region": "west-staging"},
            {"id": "spawn-a-1", "team": "A", "position": [-15, 0, 3], "facing": [1, 0, 0], "region": "west-staging"},
            {"id": "spawn-b-0", "team": "B", "position": [15, 0, -3], "facing": [-1, 0, 0], "region": "east-staging"},
            {"id": "spawn-b-1", "team": "B", "position": [15, 0, 3], "facing": [-1, 0, 0], "region": "east-staging"},
        ],
        "objectives": {
            "experience": "Demolition",
            "pickup": {"id": "bomb-pickup", "role": "shared-bomb-pickup", "position": [0, 0, -12], "region": "north-route"},
            "sites": [
                {"id": "plant-a", "role": "bomb-plant-site", "plantingTeam": "A", "position": [14, 0, 0], "region": "east-staging"},
                {"id": "plant-b", "role": "bomb-plant-site", "plantingTeam": "B", "position": [-14, 0, 0], "region": "west-staging"},
            ],
            "note": "Roles and positions only. No authored timing, damage, score, interaction reach, or replacement game rules. Adapt to existing Demolition actions after type review.",
        },
        "geometryProbes": {
            "clearanceMetres": 0.5,
            "routes": [
                {"id": "north", "points": [[-15, 0, -3], [-10, 0, -12], [0, 0, -12], [10, 0, -12], [15, 0, -3]]},
                {"id": "south", "points": [[-15, 0, 3], [-10, 0, 12], [0, 0, 12], [10, 0, 12], [15, 0, 3]]},
            ],
            "rays": [
                {"id": "blocked-by-divider", "from": [-10, 1.5, 0], "to": [10, 1.5, 0], "blocked": True},
                {"id": "clear-north", "from": [-10, 1.5, -12], "to": [10, 1.5, -12], "blocked": False},
            ],
            "note": "Fixture geometry expectations only; not engine navigation data or executed player/shot results.",
        },
    }


def variants():
    return {
        "fixtureFormat": "neutral-fixture-mutations-1",
        "base": "courtyard.source.json",
        "note": "Source mutations for future refusal tests, not packs, map definitions, patch APIs, or replacement renders.",
        "cases": [
            {"id": "unsafe-bounds", "operation": "replace-bounds", "value": {"min": [-1, 0, -1], "max": [1, 1, 1]}, "expected": "bounds-containment"},
            {"id": "disconnected", "operation": "add-wall-box", "value": {"id": "splitter", "min": [4, 0, -16], "max": [5, 4, 16]}, "expected": "disconnected-team-spawns"},
            {"id": "missing-region", "operation": "replace-pickup-region", "value": "absent-region", "expected": "unknown-region-reference"},
            {"id": "missing-team-site", "operation": "remove-team-site", "value": "B", "expected": "incomplete-demolition-sites"},
        ],
    }


def subtract(a, b):
    return [a[i] - b[i] for i in range(3)]


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def normal(vertices):
    n = cross(subtract(vertices[1], vertices[0]), subtract(vertices[2], vertices[0]))
    length = math.sqrt(dot(n, n))
    assert length > 1e-8, "degenerate polygon"
    return [v/length for v in n]


def inside(point, bounds):
    return all(bounds["min"][i] <= point[i] <= bounds["max"][i] for i in range(3))


def ray_box(start, end, box):
    lower, upper = 0.0, 1.0
    for i in range(3):
        delta = end[i] - start[i]
        if delta == 0:
            if not box["min"][i] <= start[i] <= box["max"][i]:
                return False
        else:
            a, b = sorted(((box["min"][i]-start[i])/delta, (box["max"][i]-start[i])/delta))
            lower, upper = max(lower, a), min(upper, b)
            if lower > upper:
                return False
    return True


def diagnostic_codes(data):
    """Tiny analytic checks scoped to this axis-aligned fixture, not a validator API."""
    codes = set()
    polygons = data["collision"]["polygons"]
    if any(not inside(p, data["bounds"]) for poly in polygons for p in poly["vertices"]):
        codes.add("bounds-containment")
    regions = {r["id"]: r for r in data["regions"]}
    sites = data["objectives"]["sites"]
    points = data["spawns"] + [data["objectives"]["pickup"]] + sites
    if any(p["region"] not in regions for p in points):
        codes.add("unknown-region-reference")
    if {s["plantingTeam"] for s in sites} != {"A", "B"}:
        codes.add("incomplete-demolition-sites")
    # Flood a 1 m lattice at floor height with 0.5 m horizontal clearance.
    # This is deliberately not claimed to be the engine's navigation algorithm.
    clearance = data["geometryProbes"]["clearanceMetres"]
    def free(x, z):
        return -20 + clearance <= x <= 20 - clearance and -16 + clearance <= z <= 16 - clearance and not any(
            b["min"][0]-clearance <= x <= b["max"][0]+clearance and b["min"][2]-clearance <= z <= b["max"][2]+clearance
            for b in data["render"]["wallBoxes"])
    starts = [(p["position"][0], p["position"][2]) for p in points]
    assert all(free(x, z) for x, z in starts), "marker lacks clearance"
    reached, pending = {starts[0]}, [starts[0]]
    while pending:
        x, z = pending.pop()
        for p in [(x-1, z), (x+1, z), (x, z-1), (x, z+1)]:
            if p not in reached and free(*p):
                reached.add(p)
                pending.append(p)
    if any(p not in reached for p in starts):
        codes.add("disconnected-team-spawns")
    return codes


def check_source(data):
    assert diagnostic_codes(data) == set()
    assert data["coordinates"]["unit"] == "metre" and data["coordinates"]["scale"] == [1, 1, 1]
    polygons = data["collision"]["polygons"]
    ids = [p["id"] for p in polygons] + [r["id"] for r in data["regions"]] + [s["id"] for s in data["spawns"]]
    ids += [data["objectives"]["pickup"]["id"]] + [s["id"] for s in data["objectives"]["sites"]]
    assert len(ids) == len(set(ids)), "duplicate fixture id"
    for p in polygons:
        vertices = p["vertices"]
        assert len(vertices) == 4 and all(len(v) == 3 and all(math.isfinite(n) for n in v) for v in vertices)
        n = normal(vertices)
        assert all(abs(dot(n, subtract(v, vertices[0]))) < 1e-8 for v in vertices), "nonplanar quad"
        turns = [dot(cross(subtract(vertices[(i+1)%4], vertices[i]), subtract(vertices[(i+2)%4], vertices[(i+1)%4])), n) for i in range(4)]
        assert all(t > 0 for t in turns), "nonconvex quad"
        if p["role"] == "floor":
            assert n == [0, 1, 0] and all(v[1] == 0 for v in vertices)
    for b in data["render"]["wallBoxes"]:
        faces = [p for p in polygons if p["owner"] == b["id"]]
        assert len(faces) == 6
        centre = [(a+b)/2 for a, b in zip(b["min"], b["max"])]
        assert all(dot(normal(p["vertices"]), subtract(p["vertices"][0], centre)) > 0 for p in faces), "inward wall face"
    regions = {r["id"]: r for r in data["regions"]}
    points = data["spawns"] + [data["objectives"]["pickup"]] + data["objectives"]["sites"]
    for p in points:
        assert p["position"][1] == 0 and inside(p["position"], regions[p["region"]])
    for p in data["spawns"]:
        assert dot(p["facing"], p["facing"]) == 1 and p["facing"][1] == 0
    boxes = data["render"]["wallBoxes"]
    for route in data["geometryProbes"]["routes"]:
        for a, b in zip(route["points"], route["points"][1:]):
            assert not any(ray_box([a[0], 1, a[2]], [b[0], 1, b[2]], wall) for wall in boxes)
    for ray in data["geometryProbes"]["rays"]:
        assert any(ray_box(ray["from"], ray["to"], wall) for wall in boxes) == ray["blocked"]
    for case in variants()["cases"]:
        changed = copy.deepcopy(data)
        op, value = case["operation"], case["value"]
        if op == "replace-bounds":
            changed["bounds"] = value
        elif op == "add-wall-box":
            changed["render"]["wallBoxes"].append(value)
            for face, vertices in box_faces(value["min"], value["max"]):
                changed["collision"]["polygons"].append({"id": f"{value['id']}-{face}", "owner": value["id"], "role": "wall", "region": "courtyard", "vertices": vertices})
        elif op == "replace-pickup-region":
            changed["objectives"]["pickup"]["region"] = value
        elif op == "remove-team-site":
            changed["objectives"]["sites"] = [s for s in changed["objectives"]["sites"] if s["plantingTeam"] != value]
        assert diagnostic_codes(changed) == {case["expected"]}, case["id"]


def glb_bytes(data):
    document = {"asset": {"version": "2.0", "generator": "original courtyard fixture / Python standard library"}, "scene": 0, "scenes": [{"nodes": []}], "nodes": [], "meshes": [], "materials": [], "buffers": [], "bufferViews": [], "accessors": []}
    binary = bytearray()
    def accessor(values, lanes, component_type, fmt, target):
        while len(binary) % 4:
            binary.append(0)
        raw = struct.pack("<" + fmt*len(values), *values)
        index = len(document["bufferViews"])
        document["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(raw), "target": target})
        binary.extend(raw)
        entry = {"bufferView": index, "componentType": component_type, "count": len(values)//lanes, "type": {1: "SCALAR", 3: "VEC3"}[lanes]}
        entry["min"] = [min(values[i::lanes]) for i in range(lanes)]
        entry["max"] = [max(values[i::lanes]) for i in range(lanes)]
        document["accessors"].append(entry)
        return len(document["accessors"])-1
    def mesh(name, faces, color, visual_only=False):
        positions, normals, indices = [], [], []
        for vertices in faces:
            first = len(positions)//3
            positions.extend(n for v in vertices for n in v)
            normals.extend(normal(vertices)*4)
            indices.extend(first+i for i in [0, 1, 2, 0, 2, 3])
        material = len(document["materials"])
        document["materials"].append({"name": name, "pbrMetallicRoughness": {"baseColorFactor": color, "metallicFactor": 0, "roughnessFactor": 1}, "doubleSided": False})
        primitive = {"attributes": {"POSITION": accessor(positions, 3, 5126, "f", 34962), "NORMAL": accessor(normals, 3, 5126, "f", 34962)}, "indices": accessor(indices, 1, 5123, "H", 34963), "material": material, "mode": 4}
        document["meshes"].append({"name": name, "primitives": [primitive]})
        index = len(document["nodes"])
        document["nodes"].append({"name": name, "mesh": index, "matrix": IDENTITY, "extras": {"fixtureOwner": name, "visualOnly": visual_only}})
        document["scenes"][0]["nodes"].append(index)
    mesh("courtyard-floor", [data["collision"]["polygons"][0]["vertices"]], data["render"]["floorColor"])
    for box in data["render"]["wallBoxes"]:
        mesh(box["id"], [p["vertices"] for p in data["collision"]["polygons"] if p["owner"] == box["id"]], box["color"])
    for marker in data["render"]["visualOnlyMarkers"]:
        mesh(marker["id"], [marker["vertices"]], marker["color"], True)
    document["buffers"] = [{"byteLength": len(binary)}]
    document["extras"] = {"fixture": data["id"], "coordinates": data["coordinates"], "provenance": data["provenance"]}
    raw_json = json.dumps(document, separators=(",", ":"), allow_nan=False).encode("utf-8")
    raw_json += b" " * (-len(raw_json) % 4)
    binary += b"\0" * (-len(binary) % 4)
    length = 12+8+len(raw_json)+8+len(binary)
    return struct.pack("<4sII", b"glTF", 2, length) + struct.pack("<I4s", len(raw_json), b"JSON") + raw_json + struct.pack("<I4s", len(binary), b"BIN\0") + binary


def check_glb(raw, data):
    magic, version, length = struct.unpack_from("<4sII", raw)
    assert magic == b"glTF" and version == 2 and length == len(raw)
    json_length, json_type = struct.unpack_from("<I4s", raw, 12)
    assert json_type == b"JSON" and json_length % 4 == 0
    doc = json.loads(raw[20:20+json_length])
    bin_length, bin_type = struct.unpack_from("<I4s", raw, 20+json_length)
    assert bin_type == b"BIN\0" and 28+json_length+bin_length == len(raw)
    payload = raw[28+json_length:]
    assert len(doc["buffers"]) == 1 and "uri" not in doc["buffers"][0]
    assert not any(k in doc for k in ["images", "textures", "extensionsRequired", "extensionsUsed"])
    assert all(n["matrix"] == IDENTITY for n in doc["nodes"])
    triangles = 0
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            attrs = primitive["attributes"]
            access = doc["accessors"][attrs["POSITION"]]
            view = doc["bufferViews"][access["bufferView"]]
            values = struct.unpack_from("<"+"f"*(access["count"]*3), payload, view["byteOffset"])
            assert all(math.isfinite(v) for v in values)
            assert all(inside(values[i:i+3], data["bounds"]) for i in range(0, len(values), 3))
            index_access = doc["accessors"][primitive["indices"]]
            index_view = doc["bufferViews"][index_access["bufferView"]]
            indices = struct.unpack_from("<"+"H"*index_access["count"], payload, index_view["byteOffset"])
            assert max(indices) < access["count"] and len(indices) % 3 == 0
            triangles += len(indices)//3
    for view in doc["bufferViews"]:
        assert view["byteOffset"] % 4 == 0 and view["byteOffset"]+view["byteLength"] <= doc["buffers"][0]["byteLength"]
    assert len(doc["meshes"]) == 9 and triangles == 68
    return triangles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare bytes; never write")
    args = parser.parse_args()
    data = source()
    check_source(data)
    glb = glb_bytes(data)
    triangles = check_glb(glb, data)
    outputs = {"courtyard.source.json": encoded(data), "courtyard.variants.json": encoded(variants()), "courtyard.glb": glb}
    manifest = {"fixtureFormat": "neutral-fixture-file-hashes-1", "algorithm": "sha256", "files": [{"file": name, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()} for name, raw in outputs.items()]}
    outputs["courtyard.files.json"] = encoded(manifest)
    for name, raw in outputs.items():
        path = HERE / name
        if args.check:
            assert path.read_bytes() == raw, f"regenerate {name}"
        else:
            path.write_bytes(raw)
        print(f"{name}: {len(raw)} bytes sha256={hashlib.sha256(raw).hexdigest()}")
    print(f"Structural checks: 31 planar convex collision quads; 4 floor spawns; 5 regions; pickup + 2 team sites; 2 clear routes; 2 analytic ray cases; 4 isolated negative mutations; 9 GLB meshes / {triangles} triangles; deterministic bytes.")
    print("Engine unit tests, typed adaptation, rendered movement/shots/objectives and viewer/match digest equality: NOT RUN / OWED.")


if __name__ == "__main__":
    main()
