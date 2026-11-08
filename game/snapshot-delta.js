// 전송된 비플레이어 개체를 복사해 다음 틱까지 서버의 가변 상태와 분리한다.
export function objectBaseline(/** objects: 플레이어를 포함한 방의 전송용 개체 목록. */ objects) {
  const /** copies: 다음 틱에서 비교할 비플레이어 개체의 JSON 복사본. */ copies =
    JSON.parse(JSON.stringify(objects.filter(/** 플레이어는 players 배열로만 보낸다. */ (/** object: 전송용 개체. */ object) => object.status.objectType !== 'player')));
  return new Map(copies.map(/** 식별자별로 기준 상태를 저장한다. */ (/** object: 가변 서버 상태와 분리한 개체. */ object) => [object.id, object]));
}

// 새 필드와 변경된 필드를 기록하고 사라진 필드는 키 목록으로 알린다.
function changes(/** before: 직전에 전송한 필드 집합. */ before, /** after: 이번 틱의 필드 집합. */ after) {
  const /** set: 추가하거나 교체할 필드. */ set = {};
  const /** unset: 클라이언트에서 지울 필드 이름. */ unset = [];
  for (const /** key: 비교할 JSON 필드 이름. */ key of Object.keys(after)) {
    const /** value: 이번 틱의 JSON 필드 값. */ value = after[key];
    if (value === before[key]) continue;
    if (typeof value === 'object' && JSON.stringify(value) === JSON.stringify(before[key])) continue;
    set[key] = value;
  }
  for (const /** key: 이전 틱에 존재했던 필드 이름. */ key of Object.keys(before)) {
    if (!Object.hasOwn(after, key)) unset.push(key);
  }
  return Object.keys(set).length || unset.length ? {set, unset} : null;
}

// 몬스터·NPC·사물에 같은 변경 형식을 적용하되 실제로 변한 개체만 보낸다.
export function objectChanges(/** before: 이전 틱의 비플레이어 기준 상태. */ before, /** after: 이번 틱의 비플레이어 기준 상태. */ after) {
  const /** added: 새로 생성된 개체의 전체 상태. */ added = [];
  const /** updated: 기존 개체의 일반 필드와 스테이터스 변경. */ updated = [];
  const /** removed: 소멸한 개체의 식별자. */ removed = [];
  for (const /** object: 이번 틱에 존재하는 비플레이어 개체. */ object of after.values()) {
    const /** previous: 같은 식별자의 직전 상태. */ previous = before.get(object.id);
    if (!previous) { added.push(object); continue; }
    const /** status: 체력·위협·대상 등을 포함한 스테이터스 변경. */ status = changes(previous.status, object.status);
    const /** fields: 중첩 스테이터스를 제외한 개체 필드 변경. */ fields = changes({...previous, status: null}, {...object, status: null});
    if (fields || status) updated.push({id: object.id, fields, status});
  }
  for (const /** id: 이전 틱에 존재한 개체의 식별자. */ id of before.keys()) if (!after.has(id)) removed.push(id);
  return {added, updated, removed};
}
