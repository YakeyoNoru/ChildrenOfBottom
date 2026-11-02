import { /** test: 시간 규칙 검증 등록 함수. */ test } from 'node:test';
import /** assert: 기대 결과 검사 모듈. */ assert from 'node:assert/strict';
import '../public/room-timer.js';

test('room deadline and display formatting are clamped at exact boundaries',/** 종료 유예 경계와 분:초 표시를 검증한다. */ ()=>{
 const /** timer: 서버와 브라우저가 공유하는 시간 규칙. */ timer=globalThis.RoomTimerRules;
 const /** room: 시각 1000에 생성한 방의 기한. */ room=timer.create(1000);
 assert.equal(timer.snapshot(room,601000).remainingMs,0);assert.equal(timer.expired(room,660999),false);assert.equal(timer.expired(room,661000),true);
 assert.equal(timer.format(600000),'10:00');assert.equal(timer.format(599000),'09:59');assert.equal(timer.format(1),'00:01');assert.equal(timer.format(-1),'00:00');
});
