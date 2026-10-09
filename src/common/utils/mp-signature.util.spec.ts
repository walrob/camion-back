import { createHmac } from 'crypto';
import { esFirmaMpValida } from './mp-signature.util';

const SECRET = 'secreto-de-prueba';

function firmar(manifiesto: string, ts = '1700000000') {
  const v1 = createHmac('sha256', SECRET).update(manifiesto).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('esFirmaMpValida', () => {
  it('acepta una firma correcta', () => {
    const signature = firmar('id:123;request-id:req-1;ts:1700000000;');
    expect(
      esFirmaMpValida({ secret: SECRET, signature, requestId: 'req-1', dataId: '123' }),
    ).toBe(true);
  });

  it('firma los ids alfanuméricos en minúscula', () => {
    const signature = firmar('id:abc;request-id:req-1;ts:1700000000;');
    expect(
      esFirmaMpValida({ secret: SECRET, signature, requestId: 'req-1', dataId: 'ABC' }),
    ).toBe(true);
  });

  it('rechaza un id distinto al firmado', () => {
    const signature = firmar('id:123;request-id:req-1;ts:1700000000;');
    expect(
      esFirmaMpValida({ secret: SECRET, signature, requestId: 'req-1', dataId: '999' }),
    ).toBe(false);
  });

  it('rechaza sin secreto o sin header', () => {
    const signature = firmar('id:123;ts:1700000000;');
    expect(esFirmaMpValida({ secret: '', signature, dataId: '123' })).toBe(false);
    expect(esFirmaMpValida({ secret: SECRET, dataId: '123' })).toBe(false);
  });

  it('rechaza un header mal formado', () => {
    expect(
      esFirmaMpValida({ secret: SECRET, signature: 'basura', dataId: '123' }),
    ).toBe(false);
  });
});
