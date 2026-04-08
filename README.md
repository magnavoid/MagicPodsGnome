# MagicPodsGnome✨

A GNOME Shell extension for controlling your AirPods, Beats, and Galaxy Buds from the Quick Settings panel.

## 🎨 Features

🔋 Battery level  
⚙️ Noise control  
🎧 Connect and disconnect headphones  
🔔 Low battery notifications  
🎉 New features coming soon

## 🎧 Headphones supported

| Apple            | Beats                  | Samsung           |
| ---------------- | ---------------------- | ----------------- |
| AirPods 1        | PowerBeats Pro         | Galaxy Buds       |
| AirPods 2        | PowerBeats Pro 2       | Galaxy Buds Plus  |
| AirPods 3        | PowerBeats 3           | Galaxy Buds Live  |
| AirPods 4        | PowerBeats 4           | Galaxy Buds Pro   |
| AirPods 4 (ANC)  | Beats Fit Pro          | Galaxy Buds 2     |
| AirPods Pro      | Beats Studio Buds      | Galaxy Buds 2 Pro |
| AirPods Pro 2    | Beats Studio Buds Plus | Galaxy Buds Fe    |
| AirPods Pro 3    | Beats Studio Pro       | Galaxy Buds 3     |
| AirPods Max      | Beats Solo 3           | Galaxy Buds 3 Pro |
| AirPods Max 2024 | Beats Solo Pro         |                   |
|                  | Beats Studio 3         |                   |
|                  | Beats X                |                   |
|                  | Beats Flex             |                   |
|                  | Beats Solo Buds        |                   |

Some headphones do not support all features.

## 💾 Installation

### Dependencies

Build and install [MagicPodsCore](https://github.com/steam3d/MagicPodsCore) — the backend service this extension connects to.

```
git clone https://github.com/steam3d/MagicPodsCore.git
cd MagicPodsCore
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build . -- -j$(nproc)
```

Required packages (Arch):
```
sudo pacman -S cmake gcc bluez-libs libpulse openssl
```

Required packages (Ubuntu/Debian):
```
sudo apt install cmake gcc g++ libbluetooth-dev libpulse-dev libssl-dev libsystemd-dev
```

### Install the extension

```
git clone https://github.com/magnavoid/MagicPodsGnome.git
cd MagicPodsGnome
cp /path/to/MagicPodsCore/build/magicpodscore bin/
bash install.sh
```

Then enable it:

```
gnome-extensions enable magicpods@magicpods.app
```

> **Note:** On Wayland you need to log out and back in before enabling.

## 🚀 Getting started

Once enabled, open the Quick Settings panel (click the top-right corner of the screen). The MagicPods tile will appear — click it to expand and see your headphones.

Select your headphones from the **Devices** list to connect. Once connected, battery levels and noise control options will appear automatically.

## 🧪 Ideas and bugs

In the [Discord](https://discord.com/invite/UyY4PY768V) community you can suggest an idea or report a problem.

## 🩼 Known issues

- Requires a session restart (log out and back in) on Wayland after installation.

## 💰 Donate

[Support the MagicPods project](https://magicpods.app/donate/) — every bit helps ❤️

## 💖 Developers

MagicPodsCore and MagicPodsDecky developed by [Aleksandr Maslov](https://github.com/steam3d/) and [Andrey Litvintsev](https://github.com/andreylitvintsev)

MagicPodsGnome developed by [Mike](https://github.com/magnavoid)
