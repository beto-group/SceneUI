---
cssclasses:
  - bfv-container
---

```datacorejsx
const activeFile = dc.resolvePath("SCENE UI/src/index.jsx");
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/src'));
const { View } = await dc.require(activeFile);
return await View({ folderPath, dc });
```
