/**
 * A controller the helper draws through that leaves the glass windows, and the face's relief, out of every Instrument scene
 * (`?bare=window` on the meter and gauge pages): the same layer without its windows and without any relief primitive (the panel,
 * the wells under the windows), so what is left of the face is the capture itself. The tests compare the printed scale against it
 * (text under glass is the capture itself, so it must match the layer that has no glass at all). A probe hook, not API.
 */
import type { CanvasController } from "@underglass/core";
import type { StrataGpuController } from "@underglass/ui/gpu";

type Scene = { kind?: string; objects?: { parts: { kind: string }[] }[] };
const without = <T>(scene: T): T => {
  const instrument = scene as unknown as Scene;
  if (instrument.kind !== "instrument" || !instrument.objects) return scene;
  return { ...instrument, primitives: [], objects: instrument.objects.map(object => ({ ...object, parts: object.parts.filter(part => part.kind !== "window") })) } as unknown as T;
};

export function bareController(controller: CanvasController): StrataGpuController {
  const real = controller as unknown as StrataGpuController;
  return new Proxy(real, {
    get(target, name) {
      if (name !== "setMaterial") return Reflect.get(target, name);
      return (id: string, descriptor: { scene: unknown }) => {
        const handle = target.setMaterial(id, { ...descriptor, scene: without(descriptor.scene) } as never);
        return {
          update: (scene: unknown) => handle.update(without(scene) as never), cancel: () => handle.cancel(),
          ...(handle.setEmitters ? { setEmitters: (emitters: never) => handle.setEmitters!(emitters) } : {}),
        };
      };
    },
  });
}
