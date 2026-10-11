export async function runDungeonPolishCase({ mode, page, chat, ready, camera, shot, sleep }) {
  if (mode === 'weather') {
    await chat('/dev bastion enter');
    await ready('sunkenBastionField');
    await chat('/dev bastion tp flats');
    await camera(0.8, 0.55, 16);
    await shot('bastion_rain');
    // Freeze only this effect's clock to compare a live splash across camera moves.
    await page.evaluate(() =>
      window.__game.renderer.scene.traverse((object) => {
        if (object.name === 'sunkenBastionRainSplashes') {
          object.material.uniforms.uTime = { value: 7.4 };
        }
      }),
    );
    await camera(0.8, 0.85, 16);
    await shot('splashes_view_a');
    await camera(0.85, 0.85, 16);
    await shot('splashes_view_b');
    const origin = await page.evaluate(() => {
      let result;
      window.__game.renderer.scene.traverse((object) => {
        if (object.name === 'sunkenBastionRain') {
          result = { x: object.matrixWorld.elements[12], z: object.matrixWorld.elements[14] };
        }
      });
      return result;
    });
    for (const [name, x, z, yaw] of [
      ['entry', -10, -232, 0],
      ['crown', -4, 228, Math.PI],
    ]) {
      await chat(`/dev tp ${origin.x + x} ${origin.z + z}`);
      await camera(yaw, 0.32, 30);
      console.log(
        'RAIN_EDGE',
        JSON.stringify(
          await page.evaluate(() => {
            const game = window.__game;
            const rain = [];
            game.renderer.scene.traverse((object) => {
              if (object.name.startsWith('sunkenBastionRain') && object.material) {
                rain.push({
                  name: object.name,
                  playerUniform: object.material.uniforms.uPlayerXZ?.value,
                  playerGuard: object.material.vertexShader.includes(
                    'uPlayerXZ.xy - modelMatrix[3].xz',
                  ),
                });
              }
            });
            return { player: game.world.player.pos, camera: game.renderer.camera.position, rain };
          }),
        ),
      );
      await shot(`bastion_${name}_camera_edge`);
    }
    await page.evaluate(() => window.__game.world.leaveDungeon());
    await chat('/dev tp 0 660');
    await camera(0.5, 0.12, 14);
    await shot('thornpeak_after_bastion');
    await chat('/dev sanctum enter');
    await ready('gravewyrmSanctumField');
    await chat('/dev sanctum tp landing');
    await camera(0, 0.18, 14);
    await shot('sanctum_after_bastion');
  } else if (mode === 'bridge') {
    await chat('/dev sanctum enter');
    await ready('gravewyrmSanctumField');
    await chat('/dev sanctum gates');
    await chat('/dev sanctum tp bridge');
    await camera(Math.PI, 0.8, 22);
    await sleep(10000);
    console.log(
      'BRIDGE',
      JSON.stringify(
        await page.evaluate(() => {
          const result = [];
          window.__game.renderer.scene.traverse((object) => {
            if (object.name.includes('ChainBridge')) {
              result.push({
                name: object.name,
                visible: object.visible,
                position: object.position,
                matrix: object.matrixWorld.elements,
                side: object.material?.side,
                parent: object.parent?.name,
                parentVisible: object.parent?.visible,
              });
            }
          });
          return result;
        }),
      ),
    );
    await shot('bridge_high');
  } else if (mode === 'guide') {
    await chat('/dev temple enter');
    await ready('drownedTempleField');
    const info = await page.evaluate(() => {
      const sim = window.__game.world;
      const guide = [...sim.entities.values()].find(
        (entity) => entity.templateId === 'cantor_laverock',
      );
      return { ox: sim.player.pos.x, oz: sim.player.pos.z + 230, guide: guide?.id };
    });
    if (!info.guide) throw new Error('Guide missing');
    await page.evaluate((id) => window.__game.hud.openQuestDialog(id), info.guide);
    await page.waitForSelector('[data-guide-answer="join"]', { timeout: 10000 });
    await page.evaluate(() => document.querySelector('[data-guide-answer="join"]').click());
    await chat('/dev temple kill trash');
    await camera(Math.PI / 2, 0.35, 20);
    await page.evaluate((a) => {
      window.__polishWalk = (async () => {
        const sim = window.__game.world;
        const route = [
          [0, -224],
          [3.9, -218.1],
          [0, -215],
          [-24, -196],
          [-28, -193],
          [-31, -183],
        ];
        for (let i = 0; i < route.length - 1; i++) {
          const [x0, z0] = route[i];
          const [x1, z1] = route[i + 1];
          const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3);
          for (let k = 0; k < steps; k++) {
            sim.player.pos = sim.ctx.groundPos(
              a.ox + x0 + ((x1 - x0) * k) / steps,
              a.oz + z0 + ((z1 - z0) * k) / steps,
            );
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        }
      })();
    }, info);
    for (const frame of [1, 2, 3]) {
      await sleep(2300);
      console.log(
        'GUIDE',
        JSON.stringify(
          await page.evaluate((id) => {
            const entity = window.__game.world.entities.get(id);
            const visual = window.__game.renderer.views.get(id)?.visual;
            return {
              pos: entity.pos,
              state: entity.guideState,
              actions: visual?.mixer?._actions.map((action) => ({
                clip: action.getClip().name,
                weight: action.getEffectiveWeight(),
                rate: action.getEffectiveTimeScale(),
                running: action.isRunning(),
              })),
            };
          }, info.guide),
        ),
      );
      await shot(`laverock_follow_${frame}`);
    }
    await page.evaluate(() => window.__polishWalk);
    await page.setViewport({ width: 844, height: 390 });
    await sleep(2500);
    await shot('laverock_mobile');
  } else if (mode === 'portal') {
    await chat('/dev sanctum enter');
    await ready('gravewyrmSanctumField');
    await chat('/dev sanctum gates');
    await chat('/dev sanctum kill korzul');
    const exit = await page.evaluate(() => {
      const sim = window.__game.world;
      const portals = [...sim.entities.values()].filter(
        (entity) => entity.templateId === 'dungeon_exit',
      );
      return portals.reduce((best, entity) => (entity.pos.z > best.pos.z ? entity : best)).pos;
    });
    console.log('PORTAL', JSON.stringify(exit));
    await chat(`/dev tp ${exit.x - 4} ${exit.z + 4}`);
    await camera(2.35, 0.55, 10);
    await shot('korzul_exit_portal');
    await chat(`/dev tp ${exit.x} ${exit.z}`);
    await sleep(1500);
    console.log(
      'EXIT_PLAYER',
      JSON.stringify(await page.evaluate(() => window.__game.world.player.pos)),
    );
  } else throw new Error(`Unknown mode: ${mode}`);
}
