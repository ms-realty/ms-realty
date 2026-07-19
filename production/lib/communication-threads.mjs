const SUPPORTED_LOCALES = Object.freeze(["bg", "en", "ru", "de", "nl", "el", "he"]);

const COPY = Object.freeze({
  bg: {
    acknowledgement: "Благодарим Ви за запитването{reference}. Брокер от MS Realty ще прегледа данните и ще се свърже с Вас по предпочитания канал. Това съобщение не потвърждава наличност.",
    callback: "Получихме заявката Ви за обратно обаждане{reference}. Брокер от MS Realty ще се свърже с Вас по посочения номер. Заявката все още не е потвърден час.",
    viewing: "Получихме предпочитания от Вас час за оглед{reference}{appointment}. Брокер от MS Realty ще провери наличността и ще потвърди отделно. Огледът все още не е потвърден.",
    valuation: "Получихме заявката Ви за оценка{property}. Брокер от MS Realty ще прегледа предоставените данни и ще се свърже с Вас. Това не е готова пазарна оценка.",
  },
  en: {
    acknowledgement: "Thank you for your enquiry{reference}. An MS Realty broker will review the details and contact you through your preferred channel. This message does not confirm availability.",
    callback: "We received your callback request{reference}. An MS Realty broker will contact you on the number provided. No callback time is confirmed yet.",
    viewing: "We received your preferred viewing time{reference}{appointment}. An MS Realty broker will check availability and confirm separately. The viewing is not confirmed yet.",
    valuation: "We received your valuation request{property}. An MS Realty broker will review the details provided and contact you. This is not a completed market valuation.",
  },
  ru: {
    acknowledgement: "Благодарим за ваш запрос{reference}. Брокер MS Realty проверит данные и свяжется с вами по предпочтительному каналу. Это сообщение не подтверждает наличие объекта.",
    callback: "Мы получили ваш запрос на обратный звонок{reference}. Брокер MS Realty свяжется с вами по указанному номеру. Время звонка пока не подтверждено.",
    viewing: "Мы получили выбранное вами время просмотра{reference}{appointment}. Брокер MS Realty проверит возможность и подтвердит отдельно. Просмотр пока не подтвержден.",
    valuation: "Мы получили ваш запрос на оценку{property}. Брокер MS Realty проверит предоставленные данные и свяжется с вами. Это не готовая рыночная оценка.",
  },
  de: {
    acknowledgement: "Vielen Dank für Ihre Anfrage{reference}. Ein Makler von MS Realty prüft die Angaben und kontaktiert Sie über Ihren bevorzugten Kanal. Diese Nachricht bestätigt keine Verfügbarkeit.",
    callback: "Wir haben Ihre Rückrufanfrage erhalten{reference}. Ein Makler von MS Realty meldet sich unter der angegebenen Nummer. Eine Rückrufzeit ist noch nicht bestätigt.",
    viewing: "Wir haben Ihren gewünschten Besichtigungstermin erhalten{reference}{appointment}. Ein Makler von MS Realty prüft die Verfügbarkeit und bestätigt separat. Die Besichtigung ist noch nicht bestätigt.",
    valuation: "Wir haben Ihre Bewertungsanfrage erhalten{property}. Ein Makler von MS Realty prüft die Angaben und kontaktiert Sie. Dies ist noch keine abgeschlossene Marktbewertung.",
  },
  nl: {
    acknowledgement: "Bedankt voor uw aanvraag{reference}. Een makelaar van MS Realty controleert de gegevens en neemt contact op via uw voorkeurskanaal. Dit bericht bevestigt geen beschikbaarheid.",
    callback: "We hebben uw terugbelverzoek ontvangen{reference}. Een makelaar van MS Realty neemt contact op via het opgegeven nummer. Er is nog geen terugbeltijd bevestigd.",
    viewing: "We hebben uw gewenste bezichtigingstijd ontvangen{reference}{appointment}. Een makelaar van MS Realty controleert de beschikbaarheid en bevestigt deze afzonderlijk. De bezichtiging is nog niet bevestigd.",
    valuation: "We hebben uw waarderingsverzoek ontvangen{property}. Een makelaar van MS Realty controleert de verstrekte gegevens en neemt contact met u op. Dit is nog geen afgeronde marktwaardering.",
  },
  el: {
    acknowledgement: "Ευχαριστούμε για το αίτημά σας{reference}. Μεσίτης της MS Realty θα ελέγξει τα στοιχεία και θα επικοινωνήσει μέσω του προτιμώμενου καναλιού σας. Το μήνυμα δεν επιβεβαιώνει διαθεσιμότητα.",
    callback: "Λάβαμε το αίτημά σας για επανάκληση{reference}. Μεσίτης της MS Realty θα επικοινωνήσει στον αριθμό που δώσατε. Δεν έχει ακόμη επιβεβαιωθεί ώρα κλήσης.",
    viewing: "Λάβαμε την προτιμώμενη ώρα επίσκεψης{reference}{appointment}. Μεσίτης της MS Realty θα ελέγξει τη διαθεσιμότητα και θα επιβεβαιώσει ξεχωριστά. Η επίσκεψη δεν έχει ακόμη επιβεβαιωθεί.",
    valuation: "Λάβαμε το αίτημά σας για εκτίμηση{property}. Μεσίτης της MS Realty θα ελέγξει τα στοιχεία και θα επικοινωνήσει μαζί σας. Δεν πρόκειται ακόμη για ολοκληρωμένη εκτίμηση αγοράς.",
  },
  he: {
    acknowledgement: "תודה על פנייתך{reference}. מתווך של MS Realty יבדוק את הפרטים ויצור קשר בערוץ המועדף עליך. הודעה זו אינה מאשרת זמינות.",
    callback: "קיבלנו את בקשתך לשיחה חוזרת{reference}. מתווך של MS Realty יצור קשר במספר שסופק. טרם אושר מועד לשיחה.",
    viewing: "קיבלנו את מועד הביקור המועדף עליך{reference}{appointment}. מתווך של MS Realty יבדוק זמינות ויאשר בנפרד. הביקור עדיין לא אושר.",
    valuation: "קיבלנו את בקשתך להערכת נכס{property}. מתווך של MS Realty יבדוק את הפרטים שסופקו ויצור קשר. זו עדיין אינה הערכת שוק מלאה.",
  },
});

function optionalText(value, max = 500) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function localeForLead(lead, requestedLocale) {
  const requested = String(requestedLocale || lead.original_language || "en").toLowerCase();
  return SUPPORTED_LOCALES.includes(requested) ? requested : "en";
}

function templateKind(lead) {
  const intent = String(lead.intent || "").toLowerCase();
  if (intent === "viewing") return "viewing";
  if (intent === "callback") return "callback";
  if (intent === "valuation" || lead.lead_type === "seller") return "valuation";
  return "acknowledgement";
}

function formattedFacts(lead) {
  const listingReference = optionalText(lead.listing_reference, 100);
  const appointment = [optionalText(lead.request_details?.viewing_date, 20), optionalText(lead.request_details?.viewing_time, 20)]
    .filter(Boolean)
    .join(" ");
  const property = [optionalText(lead.property?.type, 80), optionalText(lead.property?.location, 120)].filter(Boolean).join(" / ");
  return {
    reference: listingReference ? ` (${listingReference})` : "",
    appointment: appointment ? ` (${appointment})` : "",
    property: property ? ` (${property})` : "",
    listing_reference: listingReference,
    requested_appointment: appointment || null,
    property_context: property || null,
  };
}

function applyFacts(text, facts) {
  return text
    .replaceAll("{reference}", facts.reference)
    .replaceAll("{appointment}", facts.appointment)
    .replaceAll("{property}", facts.property);
}

export function communicationTemplatesForLead(lead, { locale } = {}) {
  if (!lead?.lead_id) throw new Error("Communication templates require a known lead");
  const selectedLocale = localeForLead(lead, locale);
  const kind = templateKind(lead);
  const facts = formattedFacts(lead);
  const preferredChannel = String(lead.contact_preference || "email").toLowerCase();
  const template = {
    id: `lead-${kind}-${selectedLocale}`,
    lead_id: lead.lead_id,
    kind,
    locale: selectedLocale,
    preferred_channel: preferredChannel,
    body: applyFacts(COPY[selectedLocale][kind], facts),
    facts: {
      listing_reference: facts.listing_reference,
      requested_appointment: facts.requested_appointment,
      property_context: facts.property_context,
    },
    source: "broker_template_library",
    human_review_required: true,
    can_send_without_approval: false,
  };
  return [template];
}

function eventTime(event) {
  const time = Date.parse(event.occurred_at || "");
  return Number.isFinite(time) ? time : 0;
}

export function buildCommunicationThreads({ leads = [], replies = [], outcomes = [] } = {}) {
  const repliesByLead = new Map(replies.map((reply) => [reply.lead_id, reply]));
  const outcomesByReply = new Map();
  for (const outcome of outcomes) {
    const rows = outcomesByReply.get(outcome.reply_id) || [];
    rows.push(outcome);
    outcomesByReply.set(outcome.reply_id, rows);
  }
  return leads.map((lead) => {
    const reply = repliesByLead.get(lead.lead_id);
    const events = [
      {
        id: `inbound-${lead.lead_id}`,
        type: "inbound_request",
        direction: "inbound",
        occurred_at: lead.received_at,
        actor: "customer",
        channel: lead.contact_preference || "website",
        body: optionalText(lead.message_original, 2000),
        source: lead.source,
      },
    ];
    if (reply) {
      events.push({
        id: `approved-${reply.id}`,
        type: "reply_approved",
        direction: "outbound",
        occurred_at: reply.reviewed_at,
        actor: reply.reviewer,
        channel: null,
        body: reply.reviewed_reply,
        locale: reply.reply_language,
      });
      for (const outcome of outcomesByReply.get(reply.id) || []) {
        events.push({
          id: outcome.id,
          type: `delivery_${outcome.action}`,
          direction: "outbound",
          occurred_at: outcome.recorded_at,
          actor: outcome.actor,
          channel: outcome.channel,
          body: outcome.note || null,
          sent_at: outcome.sent_at || null,
        });
      }
    }
    events.sort((left, right) => eventTime(left) - eventTime(right) || left.id.localeCompare(right.id));
    return {
      id: `communication-${lead.lead_id}`,
      lead_id: lead.lead_id,
      listing_reference: lead.listing_reference || null,
      preferred_channel: lead.contact_preference || null,
      event_count: events.length,
      latest_event_at: events.at(-1)?.occurred_at || null,
      events,
    };
  });
}

export function assertCommunicationThreads(threads) {
  if (!Array.isArray(threads)) throw new Error("Communication threads must be an array");
  const ids = new Set();
  for (const thread of threads) {
    if (!thread.id || !thread.lead_id || ids.has(thread.id)) throw new Error("Communication thread ids must be present and unique");
    ids.add(thread.id);
    if (!thread.events?.length || thread.events[0].type !== "inbound_request") {
      throw new Error("Communication threads must begin with the inbound request");
    }
    for (let index = 1; index < thread.events.length; index += 1) {
      if (eventTime(thread.events[index]) < eventTime(thread.events[index - 1])) {
        throw new Error("Communication thread events must be chronological");
      }
    }
  }
  return true;
}

export const COMMUNICATION_TEMPLATE_LOCALES = SUPPORTED_LOCALES;
