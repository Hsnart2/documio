import fs from "node:fs";

const filePath = "app/SmartHomeV2.tsx";
let source = fs.readFileSync(filePath, "utf8");

const original = source;

if (!source.includes('import { usePathname } from "next/navigation";')) {
  source = source.replace(
    'import { useEffect, useMemo, useState } from "react";\n',
    'import { useEffect, useMemo, useState } from "react";\nimport { usePathname } from "next/navigation";\n',
  );
}

if (!source.includes("const pathname = usePathname();")) {
  source = source.replace(
    "export default function SmartHomeV2() {\n",
    "export default function SmartHomeV2() {\n  const pathname = usePathname();\n",
  );
}

source = source.replace(
  '    if (window.location.pathname !== "/") return;\n',
  '    if (pathname !== "/") return;\n',
);

source = source.replace(
  "  }, []);\n\n  const summary = useMemo(() => {",
  "  }, [pathname]);\n\n  const summary = useMemo(() => {",
);

if (source === original) {
  console.log("Smart Home route persistence already applied.");
} else {
  fs.writeFileSync(filePath, source);
  console.log("Applied Smart Home route persistence fix.");
}
