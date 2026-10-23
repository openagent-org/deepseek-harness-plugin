#!/usr/bin/env python3
"""核对官方安装和已停止的 profile，通过 Harness 原生命令移除 OpenAgent。"""

from __future__ import annotations

import argparse
import copy
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


PLUGIN = "dsh-openagent"
DEPENDENCIES = ("dependencies", "devDependencies", "optionalDependencies")
SOURCES = {
    "github:openagent-org/deepseek-harness-plugin#rel",
    *(prefix + host + "/openagent-org/deepseek-harness-plugin.git#rel"
      for prefix in ("git+https://", "https://") for host in ("github.com", "gitee.com")),
}


def read_json(path: Path) -> dict:
    if path.is_symlink() or not path.is_file():
        raise ValueError("安装清单缺失、不是普通文件或为符号链接")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeError, ValueError):
        raise ValueError("安装清单不是有效 JSON，停止卸载") from None
    if not isinstance(value, dict):
        raise ValueError("安装清单格式无效，停止卸载")
    return value


def inspect_profile(directory: Path):
    """只读原生 manifest 和包名；不读 patch、认证或用户会话。"""
    if directory.is_symlink():
        raise ValueError("profile 目录为符号链接，停止卸载")
    manifest_path = directory / "package.json"
    package = directory / "node_modules" / PLUGIN
    if not manifest_path.exists() and not manifest_path.is_symlink():
        if package.exists() or package.is_symlink():
            raise ValueError("发现残留插件包，但缺少 profile 安装清单")
        return None
    manifest = read_json(manifest_path)
    sources = []
    for field in DEPENDENCIES:
        values = manifest.get(field, {})
        if not isinstance(values, dict):
            raise ValueError("profile 依赖清单格式无效")
        if PLUGIN in values:
            sources.append(values[PLUGIN])
    dsh = manifest.get("dsh", {})
    profile = dsh.get("profile", {}) if isinstance(dsh, dict) else None
    bundles = profile.get("bundles", []) if isinstance(profile, dict) else None
    if not isinstance(bundles, list) or any(not isinstance(x, str) for x in bundles):
        raise ValueError("原生 bundle 清单格式无效")
    present = package.exists() or package.is_symlink()
    if not sources:
        if PLUGIN in bundles or present:
            raise ValueError("发现残留 bundle 或插件包，但缺少官方来源依赖；停止卸载")
        return None
    if any(not isinstance(source, str) or source not in SOURCES for source in sources):
        raise ValueError("同名插件不是已确认的官方 GitHub/Gitee rel 来源；停止卸载")
    if present:
        modules = directory / "node_modules"
        if modules.is_symlink() or modules.resolve() not in package.resolve().parents:
            raise ValueError("插件包指向 profile 的 node_modules 之外，停止卸载")
        if read_json(package / "package.json").get("name") != PLUGIN:
            raise ValueError("已安装包名称与 dsh-openagent 不一致，停止卸载")
    return manifest


def select_profile(home: Path, profile=None):
    profiles = home / "profiles"
    if profiles.is_symlink():
        raise ValueError("profiles 目录为符号链接，停止卸载")
    if profile is not None:
        if (not profile or profile in (".", "..", "node_modules")
                or any(c in profile for c in '/\\\r\n\x00')):
            raise ValueError("profile 名称无效")
        profile = "desktop" if profile.lower() == "desktop" else profile
        directory = profiles / profile
        return (directory, inspect_profile(directory))
    candidates = []
    if profiles.exists():
        if not profiles.is_dir():
            raise ValueError("profiles 不是目录")
        for directory in sorted(profiles.iterdir()):
            if directory.is_dir() or directory.is_symlink():
                manifest = inspect_profile(directory)
                if manifest is not None:
                    candidates.append((directory, manifest))
    if len(candidates) > 1:
        raise ValueError("多个 profile 安装了 OpenAgent，请用 --profile 指定一个；不会批量卸载")
    return candidates[0] if candidates else (None, None)


def desktop_cli(app: Path) -> Path:
    suffix = ("Contents/Resources/runtime/cli/bin/dsh" if sys.platform == "darwin"
              else "resources/runtime/cli/bin/dsh.cmd")
    return app / suffix


def locate_cli(profile: str, app=None) -> Path:
    if profile != "desktop":
        command = shutil.which("dsh")
        if not command:
            raise RuntimeError("未找到已有 dsh；请恢复当前 Harness 的 CLI，不要另装 npm CLI")
        return Path(command).resolve()
    if sys.platform not in ("darwin", "win32"):
        raise RuntimeError("此平台没有已核对的 Desktop CLI 路径，请使用原生插件页面移除")
    if app is not None:
        candidates = [desktop_cli(Path(app).expanduser().resolve())]
    elif sys.platform == "darwin":
        candidates = [desktop_cli(p) for p in (
            Path("/Applications/DeepSeek Harness.app"), Path.home() / "Applications/DeepSeek Harness.app")]
    else:
        command = shutil.which("dsh")
        candidates = [Path(command).resolve()] if command else []
        candidates = [p for p in candidates if p.as_posix().lower().endswith("/resources/runtime/cli/bin/dsh.cmd")]
    candidates = list(dict.fromkeys(p.resolve() for p in candidates if p.is_file()))
    if len(candidates) != 1:
        raise RuntimeError("无法唯一定位 Desktop 内置 dsh，请用 --desktop-app 指定应用安装目录")
    return candidates[0]


def running_profile(profile: str, cli: Path) -> bool:
    """官方没有运行期 profile PID 文件；仅识别官方入口，命令行留在内存。"""
    try:
        if sys.platform == "win32":
            command = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                       "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"]
            result = subprocess.run(command, text=True, capture_output=True, timeout=15, check=False)
            if result.returncode:
                raise ValueError()
            entries = json.loads(result.stdout)
            entries = entries if isinstance(entries, list) else [entries]
            rows = [(int(p["ProcessId"]), p.get("Name", ""), p.get("CommandLine") or "") for p in entries]
        else:
            result = subprocess.run(["ps", "-axo", "pid=,args="], text=True,
                                    capture_output=True, timeout=15, check=False)
            if result.returncode:
                raise ValueError()
            rows = [(int(parts[0]), "", parts[1]) for line in result.stdout.splitlines()
                    if len(parts := line.strip().split(None, 1)) == 2]
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        raise RuntimeError("无法核实 Harness 运行状态，停止卸载；请确认客户端已正常退出") from None
    if not rows:
        raise RuntimeError("进程查询未返回可核对的结果，停止卸载")
    for pid, name, command in rows:
        if pid == os.getpid():
            continue
        normalized = command.replace("\\", "/")
        desktop = (name.lower() == "deepseek harness.exe"
                   or re.search(r"/[^/]+\.app/Contents/MacOS/DeepSeek Harness(?=[\s\"']|$)", normalized))
        entry = re.search(r"(?:/@deepseek-ai/dsh/lib/bin\.js|/apps/cli/(?:lib/bin\.js|src/bin\.ts)"
                          r"|/@deepseek-ai/dsh-desktop-host/lib/(?:cli|index)\.js|(?:^|\s)(?:\S*/)?dsh(?:\.cmd)?)(?=[\s\"']|$)", normalized)
        host_desktop = re.search(r"/@deepseek-ai/dsh-desktop-host/lib/index\.js(?=[\s\"']|$)", normalized)
        if host_desktop or (desktop and not entry):
            if profile == "desktop":
                return True
            continue
        if not desktop and not entry and str(cli).replace("\\", "/") not in normalized:
            continue
        selected = re.search(r'(?:^|\s)--profile(?:=|\s+)(?:"([^"\r\n]+)"|\'([^\'\r\n]+)\'|([^\s"\']+))', normalized)
        selected_name = next((part for part in selected.groups() if part is not None), None) if selected else None
        if selected_name and not re.search(r"\s", profile) and selected_name.lower() != profile.lower():
            continue
        # 无法确定 profile 的官方进程也拒绝；不猜测它的 DSH_HOME 或发送信号。
        return True
    return False


def check_stopped(directory: Path, cli: Path) -> None:
    if any((directory / name).exists() or (directory / name).is_symlink()
           for name in ("lock", "package.json.lock", ".plugin-manager/run.json")):
        raise RuntimeError("检测到 profile 初始化或包管理锁，请先通过 Harness 核实；不会清理锁或重试")
    if running_profile(directory.name, cli):
        raise RuntimeError("检测到 Harness 仍在运行或无法确定其 profile，请正常退出后再卸载")


def other_manifest(manifest: dict) -> dict:
    value = copy.deepcopy(manifest)
    for field in DEPENDENCIES:
        if field in value:
            value[field].pop(PLUGIN, None)
            if not value[field]:
                del value[field]
    profile = value.get("dsh", {}).get("profile", {})
    if "bundles" in profile:
        profile["bundles"] = [name for name in profile["bundles"] if name != PLUGIN]
    return value


def uninstall(home: Path, *, profile=None, desktop_app=None, yes=False, dry_run=False) -> None:
    home = home.expanduser().resolve()
    if home == Path(home.anchor) or (home.exists() and not home.is_dir()):
        raise ValueError("DSH_HOME 必须是 Harness 主目录，不能是文件系统根目录或普通文件")
    directory, before = select_profile(home, profile)
    if before is None:
        print("未发现目标 profile 中已安装的 OpenAgent 或冲突残留；无需卸载。")
        return
    cli = locate_cli(directory.name, desktop_app)
    print(f"目标主目录：{home}\n目标 profile：{directory.name}\n原生 CLI：{cli}")
    print("将仅移除 dsh-openagent；保留其他插件、配置和共享 openagent-auth。")
    if dry_run:
        try:
            check_stopped(directory, cli)
        except RuntimeError as error:
            print(f"执行前须处理：{error}")
        print("预览完成，未调用原生卸载命令，也未写入任何文件。")
        return
    check_stopped(directory, cli)
    if not yes:
        if not sys.stdin.isatty():
            raise RuntimeError("非交互卸载需要 --yes；可先使用 --dry-run")
        if input("确认卸载 OpenAgent？输入 yes 继续：").strip().lower() != "yes":
            raise RuntimeError("用户取消，未执行卸载")
    if inspect_profile(directory) != before:
        raise RuntimeError("确认期间安装状态发生变化，停止卸载")
    check_stopped(directory, cli)
    # Windows 的 .cmd 由系统命令解释器执行；拒绝可能被其再次展开的字符。
    if sys.platform == "win32" and re.search(r'[&|<>^%!\r\n"]', str(cli) + directory.name):
        raise ValueError("此 Windows 路径或 profile 含命令解释器特殊字符，停止卸载")
    result = subprocess.run([str(cli), "plugin", "--profile=" + directory.name, "remove", PLUGIN],
                            env=dict(os.environ, DSH_HOME=str(home)), stdin=subprocess.DEVNULL,
                            text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(f"原生卸载失败（退出码 {result.returncode}）；已保留现场，不自动重试")
    after = read_json(directory / "package.json")
    if inspect_profile(directory) is not None:
        raise RuntimeError("原生命令结束后插件依赖仍存在，卸载未完成")
    if other_manifest(before) != other_manifest(after):
        raise RuntimeError("原生命令修改了其他 profile 清单字段，请核对现场；不自动回滚或重试")
    print("OpenAgent 已从该 profile 卸载，依赖、原生 bundle 和包路径已核对；共享认证目录保留。")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    default_home = os.environ.get("DSH_HOME", "")
    parser.add_argument("--dsh-home", type=Path, default=Path(default_home if default_home.strip() else "~/.dsh"))
    parser.add_argument("--profile", help="只卸载指定 profile；默认选择唯一的官方安装")
    parser.add_argument("--desktop-app", type=Path, help="Desktop 的 .app 或 Windows 应用安装目录")
    parser.add_argument("--yes", action="store_true", help="确认卸载，不再询问")
    parser.add_argument("--dry-run", action="store_true", help="只读核对并预览")
    args = parser.parse_args(argv)
    try:
        uninstall(args.dsh_home, profile=args.profile, desktop_app=args.desktop_app,
                  yes=args.yes, dry_run=args.dry_run)
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(f"卸载停止：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
