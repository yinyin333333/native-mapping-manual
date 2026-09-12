"""Verify documented configurations against the supplied, unmodified C++ source.

Only generated checker output is written, under this manual's .test-output.
There is no independent implementation of the configuration rules here.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / ".test-output"
SOURCE_FILES = (
    "evidence/RESET_IMPLEMENTATION.md", "evidence/reset-build.json", "FEATURES_AND_USAGE_KO.md",
    "MODDER_USAGE_GUIDE.md", "MODDER_GUIDE.md", "README.md", "CMakeLists.txt",
    "plugin/CMakeLists.txt", "plugin/native-mapping.toml", "mapping_core/CMakeLists.txt",
    "mapping_core/include/mapping/config/RuntimeConfig.hpp",
    "mapping_core/src/config/RuntimeConfig.cpp", "mapping_core/src/config/RuntimeRoll.cpp",
    "mapping_core/src/config/RuntimeDisplay.cpp",
    "data/global/ui/layouts/hudwarnings.json", "data/global/ui/layouts/hudwarningshd.json",
)


class CodeBlocks(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[tuple[dict, str]] = []
        self.current: dict | None = None
        self.text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "code":
            self.current, self.text = dict(attrs), []

    def handle_data(self, data: str) -> None:
        if self.current is not None:
            self.text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "code" and self.current is not None:
            self.blocks.append((self.current, "".join(self.text)))
            self.current = None


def run(command: list[str], *, capture: bool = False) -> str:
    result = subprocess.run(command, cwd=ROOT, check=True, text=True, encoding="utf-8",
                            errors="replace", stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.STDOUT if capture else None)
    return result.stdout or ""


def require(condition: bool, detail: str) -> None:
    if not condition:
        raise ValueError(detail)


def source_hashes(source: Path) -> dict[str, str]:
    return {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in SOURCE_FILES}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=os.environ.get("NATIVE_MAPPING_SOURCE"), help="Native Mapping source root")
    parser.add_argument("--toml", help="Existing toml++ source checkout")
    args = parser.parse_args()
    if not args.source:
        parser.error("Supply --source or set NATIVE_MAPPING_SOURCE")
    source = Path(args.source).resolve(strict=True)
    candidates = [source / "out-reset/_deps/tomlplusplus-src", source / "out-compat-1308/_deps/tomlplusplus-src", source / "out/_deps/tomlplusplus-src"]
    toml_source = Path(args.toml).resolve(strict=True) if args.toml else next((p for p in candidates if p.exists()), None)
    require(toml_source is not None, "Supply an existing toml++ checkout with --toml")
    before = source_hashes(source)
    OUTPUT.mkdir(exist_ok=True)
    excerpts_dir = OUTPUT / "excerpts"
    excerpts_dir.mkdir(exist_ok=True)
    build = OUTPUT / "native-reset"
    run(["cmake", "-S", str(ROOT / "tests/native"), "-B", str(build), "-G", "Visual Studio 17 2022", "-A", "x64", f"-DNATIVE_MAPPING_SOURCE={source}", f"-DTOMLPLUSPLUS_SOURCE={toml_source}"])
    run(["cmake", "--build", str(build), "--config", "Release", "--parallel"])
    executable = build / "Release/manual_source_check.exe"
    results = []
    for example in sorted((ROOT / "examples").glob("*.toml")):
        tomllib.loads(example.read_text(encoding="utf-8"))
        command = [str(executable), str(example)]
        if example.name == "first-map.toml":
            command.append("--first")
        output = run(command, capture=True).strip()
        print(f"PASS {example.name}: {output}")
        results.append({"example": example.name, "kind": "complete", "result": output})
    document = CodeBlocks()
    for page in [ROOT / "index.html", *sorted((ROOT / "guides").glob("*.html"))]:
        document.feed(page.read_text(encoding="utf-8"))
    for attrs, text in document.blocks:
        if attrs.get("data-language") != "toml":
            continue
        identity = attrs["id"]
        parsed = tomllib.loads(text)
        if attrs.get("data-kind") == "complete":
            complete = ROOT / attrs["data-file"]
            require(text.strip() == complete.read_text(encoding="utf-8").strip(), f"Displayed {identity} differs from download")
            continue
        require(attrs.get("data-kind") == "excerpt", f"Missing excerpt label: {identity}")
        context = ROOT / attrs["data-context"]
        require(context.is_file(), f"Missing complete context: {identity}")
        excerpt = excerpts_dir / f"{identity}.toml"
        excerpt.write_text(text, encoding="utf-8")
        output = run([str(executable), str(excerpt), str(context)], capture=True).strip()
        print(f"PASS {identity}: {output}")
        results.append({"example": identity, "kind": "excerpt", "context": attrs["data-context"], "result": output})
    require(len(results) == 19, "Expected twelve complete examples and seven excerpts")
    for variant, filename in [("standard", "hudwarnings.json"), ("hd", "hudwarningshd.json")]:
        original = json.loads((source / "data/global/ui/layouts" / filename).read_text(encoding="utf-8"))
        node = next(child for child in original["children"] if child["name"] == "MappingInfoTextWrapper")
        public = json.loads((ROOT / "examples" / f"hud-{variant}-node.json").read_text(encoding="utf-8"))
        require(node == public, f"HUD {variant} download differs from source node")
        shown = next(text for attrs, text in document.blocks if attrs.get("id") == f"hud-{variant}-code")
        require(json.loads(shown) == public, f"HUD {variant} displayed object differs from download")
        print(f"PASS {variant} HUD object matches source and displayed JSON")
    after = source_hashes(source)
    require(before == after, "A source file changed during verification")
    report = {"source": str(source), "source_files": before, "source_unchanged": True, "parser_results": results}
    (OUTPUT / "source-verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"\n{len(results)} configurations accepted by the source parser. Source files unchanged.")


if __name__ == "__main__":
    main()
