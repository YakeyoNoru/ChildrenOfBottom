import { /** test: Node의 테스트 실행 함수. */ test } from 'node:test';
import /** assert: 생성 결과와 오류를 검사하는 단언 모듈. */ assert from 'node:assert/strict';
import { /** createMonster: 프리셋에서 독립 몬스터 유닛을 생성하는 함수. */ createMonster } from '../game/monsters.js';

test('monster presets preserve their shared species and distinct stats', /** 같은 종류의 두 프리셋이 지정 수치와 가득 찬 체력으로 생성되는지 검사한다. */ () => {
  for (const /** id: 생성할 프리셋 이름; level: 기대 레벨; health: 기대 최대·현재체력; attack: 기대 공격력; experience: 기대 처치 경험치. */ [id, level, health, attack, experience] of [
    ['몬스터A01', 1, 20, 3, 20], ['몬스터A02', 5, 50, 10, 50],
  ]) {
    const /** monster: 위치를 지정해 생성한 검증용 몬스터. */ monster = createMonster(id, { x: 12, y: 34 });
    assert.equal(monster.presetId, id);
    assert.equal(monster.status.objectType, 'enemy');
    assert.equal(monster.status.classificationCode, 'TEST001');
    assert.equal(monster.status.level, level);
    assert.equal(monster.status.hitboxDiameter, 26);
    assert.equal(monster.status.maxHealth, health);
    assert.equal(monster.status.currentHealth, health);
    assert.equal(monster.status.attack, attack);
    assert.equal(monster.status.experience, experience);
    assert.equal(monster.status.moveSpeed, 2);
    assert.deepEqual([monster.x, monster.y], [12, 34]);
  }
});

test('monster instances have independent identities and mutable state', /** 같은 프리셋의 반복 생성이 개체ID·체력·목록을 공유하지 않는지 검사한다. */ () => {
  const /** first: 상태를 변경할 첫 번째 몬스터. */ first = createMonster('몬스터A01');
  const /** second: 독립 여부를 검사할 두 번째 몬스터. */ second = createMonster('몬스터A01');
  assert.notEqual(first.id, second.id);
  first.status.currentHealth = 1;
  first.status.rewards.push({ itemCode: 'TEST' });
  first.status.statusEffects.push({ code: 'TEST' });
  assert.equal(second.status.currentHealth, 20);
  assert.deepEqual(second.status.rewards, []);
  assert.deepEqual(second.status.statusEffects, []);
  assert.equal(createMonster('몬스터A01').status.currentHealth, 20);
  assert.throws(/** 이전 이름은 프리셋으로 허용하지 않는다. */ () => createMonster('몬스터A'), TypeError);
  assert.throws(/** 객체 원형의 필드를 프리셋으로 허용하지 않는다. */ () => createMonster('toString'), TypeError);
});
