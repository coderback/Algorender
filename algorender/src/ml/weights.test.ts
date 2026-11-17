import { afterAll, describe, expect, it } from 'vitest';
import { getModule, modules } from '@/registry';
import { fromModel, hasModels, loadModel, loadModels, model, onModelsLoaded, setModelSource, type ModelFile } from './weights';
import { diskSource, loadModelsFromDisk, modelNames } from './weights.node';

const file = (name: string, weights: unknown = [1, 2, 3]): ModelFile => ({ name, hash: 'h', config: {}, loss: 0.1, weights });

afterAll(loadModelsFromDisk);

describe('the weight loader', () => {
  it('fetches a model once, however many ask at the same time', async () => {
    let calls = 0;
    setModelSource(async (name) => {
      calls++;
      return file(name);
    });
    expect(hasModels(['a'])).toBe(false);
    expect(() => model('a')).toThrow(/isn't loaded/);
    const [x, y] = await Promise.all([loadModel('a'), loadModel('a')]);
    expect(x).toBe(y);
    await loadModels(['a', 'a']);
    expect(calls).toBe(1);
    expect(hasModels(['a'])).toBe(true);
    expect(model('a').weights).toEqual([1, 2, 3]);
  });

  it('tells listeners when a model arrives, and lets a failed load be tried again', async () => {
    let fail = true;
    setModelSource(async (name) => {
      if (fail) throw new Error('offline');
      return file(name);
    });
    let heard = 0;
    const stop = onModelsLoaded(() => heard++);
    await expect(loadModel('b')).rejects.toThrow('offline');
    expect(heard).toBe(0);
    fail = false;
    await loadModel('b');
    expect(heard).toBe(1);
    stop();
    await loadModel('c');
    expect(heard).toBe(1);
  });

  it('refuses a file that holds another model', async () => {
    setModelSource(async () => file('other'));
    await expect(loadModel('d')).rejects.toThrow(/holds the other model/);
  });

  it('builds from a model once, and again only when the model is loaded afresh', async () => {
    setModelSource(async (name) => file(name, [4]));
    await loadModel('e');
    let builds = 0;
    const sum = fromModel<number, number[]>('e', (f) => (builds++, f.weights.reduce((a, b) => a + b, 0)));
    expect(sum()).toBe(4);
    expect(sum()).toBe(4);
    expect(builds).toBe(1);
    setModelSource(async (name) => file(name, [5]));
    expect(() => sum()).toThrow(/isn't loaded/);
    await loadModel('e');
    expect(sum()).toBe(5);
    expect(builds).toBe(2);
  });
});

describe('models on disk', () => {
  it('serves every model a module lists, and every model is used by some module', async () => {
    setModelSource(diskSource);
    const listed = new Set(Object.values(modules).flatMap((m) => m.models ?? []));
    expect([...listed].sort()).toEqual(modelNames().sort());
    await loadModels([...listed]);
    expect(getModule('diffusion')?.models).toEqual(['diffusion']);
  });
});
