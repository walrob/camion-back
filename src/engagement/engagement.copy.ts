import {
  ActivationGap,
  EngagementSegment,
  FirstTripGap,
} from './engagement.rules';

/**
 * Textos de los emails de activación y re-enganche. El diseño es el de todos
 * los emails del sistema (`EmailService.plantilla`): acá va sólo el contenido.
 *
 * Criterio: 3 a 5 líneas, un solo botón con un verbo concreto, el beneficio
 * para quien maneja la flota antes que la función, y la firma de una persona.
 * Los asuntos van en minúscula y cortos, como los escribe una persona y no un
 * sistema.
 */

export const SIGNATURE = 'Walter de CamioNex';
export const CLOSING = 'Si te trabaste en algo, respondé este mail y te ayudo.';

export interface EngagementContext {
  /** Primer nombre de quien recibe. Puede venir vacío. */
  name: string;
  /** Link de verificación (segmento A). */
  verifyUrl?: string;
  /** B: el paso que le falta para cargar el primer viaje. */
  activationGap?: ActivationGap;
  /** C: lo que conviene hacer después del primer viaje. */
  firstTripGap?: FirstTripGap;
  /** Casilla que lee las respuestas, para el mailto del último email de D. */
  replyTo?: string;
}

export interface EngagementMessage {
  subject: string;
  title: string;
  /** Párrafos, ya en HTML (lo que viene del usuario va escapado). */
  paragraphs: string[];
  /** Aclaración chica debajo del botón. */
  note?: string;
  ctaLabel: string;
  /** A dónde lleva el botón, sin UTM: se los agrega el servicio. */
  target: string;
}

const front = () => process.env.FRONT_URL ?? '';

/** El nombre viene del usuario: nunca entra crudo al HTML. */
export const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string,
  );

/** "falta un solo paso, Ana" / "falta un solo paso" si no hay nombre. */
const withName = (text: string, name: string) =>
  name ? `${text}, ${name}` : text;

/** B: a dónde lleva el botón según lo que le falta. */
const ACTIVATION_CTA: Record<ActivationGap, { label: string; path: string }> = {
  truck: {
    label: 'Cargar mi primer camión',
    path: '/admin/flota?tab=trucks&nuevo=camion',
  },
  driver: { label: 'Cargar mi primer chofer', path: '/admin/choferes?nuevo=1' },
  trip: { label: 'Cargar mi primer viaje', path: '/admin/viajes?nuevo=1' },
};

/** B, paso 1: qué hacer ahora, según lo que ya cargó. */
const ACTIVATION_NEXT: Record<ActivationGap, string> = {
  truck:
    'El primer paso es cargar un camión: con la patente alcanza, y en dos minutos tenés la base para todo lo demás.',
  driver:
    'Ya tenés camiones cargados. Sumá un chofer —con nombre y DNI alcanza— y le asignás su primer viaje.',
  trip: 'Ya tenés camión y chofer. Cargá un viaje y mirá cómo le aparece al chofer en el celular, sin llamarlo.',
};

/** B, paso 2: la última línea, que empuja al paso que falta. */
const ACTIVATION_PUSH: Record<ActivationGap, string> = {
  truck: 'Arrancá por cargar un camión.',
  driver: 'Te falta un chofer para arrancar.',
  trip: 'Probalo con un solo viaje.',
};

export function buildEngagementMessage(
  segment: EngagementSegment,
  step: number,
  ctx: EngagementContext,
): EngagementMessage {
  const name = esc(ctx.name);
  const hello = name ? `Hola, ${name}.` : 'Hola.';

  switch (segment) {
    case EngagementSegment.UNVERIFIED: {
      const base = {
        ctaLabel: 'Confirmar mi correo',
        target: ctx.verifyUrl ?? `${front()}/auth/login`,
        note: 'El enlace vence en 24 horas.',
      };
      if (step === 1)
        return {
          ...base,
          subject: withName('falta un solo paso', ctx.name),
          title: 'Falta un solo paso',
          paragraphs: [
            `${hello} Creaste tu cuenta en CamioNex pero todavía no confirmaste tu correo.`,
            'Es un clic, y con eso entrás a tu prueba gratis: viajes, gastos y vencimientos de la flota en un solo lugar, sin el cuaderno ni el Excel.',
          ],
        };
      if (step === 2)
        return {
          ...base,
          subject: withName('tu prueba gratis te está esperando', ctx.name),
          title: 'Tu prueba gratis te está esperando',
          paragraphs: [
            `${hello} Ayer arrancaste con CamioNex y quedó un paso pendiente: confirmar tu correo.`,
            'Hasta que lo confirmes no podés entrar, y los 30 días de prueba ya empezaron a correr.',
          ],
        };
      return {
        ...base,
        subject: `${withName('¿te llegó bien el mail', ctx.name)}?`,
        title: '¿Te llegó bien el mail?',
        paragraphs: [
          `${hello} Hace unos días creaste tu cuenta y el correo nunca se confirmó. A veces cae en spam o el enlace se vence.`,
          'Te dejo uno nuevo. Si ya no te interesa, ignorá este mail y no te escribo más por esto.',
        ],
      };
    }

    case EngagementSegment.ACTIVATION: {
      const gap = ctx.activationGap ?? 'trip';
      const base = {
        ctaLabel: ACTIVATION_CTA[gap].label,
        target: `${front()}${ACTIVATION_CTA[gap].path}`,
      };
      if (step === 1)
        return {
          ...base,
          subject: withName('tu cuenta ya está lista', ctx.name),
          title: 'Tu cuenta ya está lista',
          paragraphs: [`${hello} Ya podés empezar a ordenar tu flota.`, ACTIVATION_NEXT[gap]],
        };
      if (step === 2)
        return {
          ...base,
          subject: 'menos llamadas al chofer desde esta semana',
          title: 'Menos llamadas, menos papeles',
          paragraphs: [
            `${hello} Cuando el viaje está en CamioNex, el chofer lo ve en el celular y carga los gastos con la foto del ticket desde la ruta.`,
            `Al volver, la rendición se arma sola: nadie tipea tickets. ${ACTIVATION_PUSH[gap]}`,
          ],
        };
      return {
        ...base,
        subject: `${withName('¿qué te frenó', ctx.name)}?`,
        title: '¿Qué te frenó?',
        paragraphs: [
          `${hello} Pasó una semana y tu flota todavía no tiene su primer viaje en CamioNex.`,
          'Si algo no cerró —por dónde empezar o cómo cargar a los choferes—, contame y lo vemos juntos. Y si tenés todo en un Excel, te lo cargamos nosotros.',
        ],
      };
    }

    case EngagementSegment.FIRST_TRIP: {
      const base = {
        subject: `${withName('¡primer viaje cargado', ctx.name)}!`,
        title: '¡Primer viaje cargado!',
      };
      if (ctx.firstTripGap === 'expirations')
        return {
          ...base,
          paragraphs: [
            `${hello} Ya tenés tu primer viaje en CamioNex.`,
            'Ahora cargá los vencimientos —VTV, seguros, licencias— y el sistema te avisa antes de que algo venza: nada de enterarte en un control de ruta.',
          ],
          ctaLabel: 'Cargar los vencimientos',
          target: `${front()}/admin/documentos?nuevo=1`,
        };
      return {
        ...base,
        paragraphs: [
          `${hello} Ya tenés tu primer viaje en CamioNex.`,
          'El próximo paso es que el chofer lo reciba en el celular: le das un usuario y desde la ruta carga gastos, checklist e incidentes, sin llamadas ni WhatsApp.',
        ],
        ctaLabel: 'Darle la app a mi chofer',
        target: `${front()}/admin/choferes`,
      };
    }

    case EngagementSegment.INACTIVE: {
      const panel = {
        ctaLabel: 'Volver a mi panel',
        target: `${front()}/admin`,
      };
      if (step === 1)
        return {
          ...panel,
          subject: `${withName('¿cómo viene la flota', ctx.name)}?`,
          title: '¿Cómo viene la flota?',
          paragraphs: [
            `${hello} Hace una semana que nadie de tu empresa entra a CamioNex. Todo lo que cargaste sigue ahí.`,
            'Con unos minutos por semana tenés los viajes, los gastos y los vencimientos al día, sin perseguir a nadie por WhatsApp.',
          ],
        };
      if (step === 2)
        return {
          ...panel,
          subject: `${withName('¿te ayudo a retomar', ctx.name)}?`,
          title: '¿Te ayudo a retomar?',
          paragraphs: [
            `${hello} Pasaron dos semanas desde la última vez que alguien de tu empresa entró a CamioNex.`,
            'Si se complicó arrancar, en 15 minutos lo dejamos andando juntos por videollamada: camiones, choferes y el primer viaje. Respondé este mail y coordinamos.',
          ],
        };
      return {
        subject: '¿sigue sirviéndote CamioNex?',
        title: '¿Sigue sirviéndote CamioNex?',
        paragraphs: [
          `${hello} Hace un mes que nadie de tu empresa entra y prefiero preguntarte antes que seguir escribiéndote: ¿qué faltó?`,
          'Puede ser algo del sistema, del precio o que no era el momento. Tu respuesta, aunque sea de una línea, me ayuda a mejorar CamioNex. Es el último mail de este tipo que te mando.',
        ],
        ctaLabel: 'Contarte qué faltó',
        target: ctx.replyTo
          ? `mailto:${ctx.replyTo}?subject=${encodeURIComponent('Lo que me faltó en CamioNex')}`
          : `${front()}/contacto`,
      };
    }
  }
}
