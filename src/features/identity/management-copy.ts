const en = {
  title: "Manage access",
  lead: "Invite people to an explicit scope, or restore a staff member’s access after verifying their identity.",
  staffTitle: "Invite a staff member",
  name: "Full name",
  email: "Email address",
  role: "Staff role",
  invite: "Queue invitation",
  recoveryTitle: "Restore staff access",
  member: "Staff member",
  evidence: "How you verified this person’s identity",
  recoveryNote:
    "This revokes their current sessions and passkeys. They must register two new passkeys.",
  confirm: "I verified this person’s identity and reviewed the access change.",
  recover: "Revoke old access and queue recovery",
  clientTitle: "Invite a client",
  case: "Case",
  participant: "Participant role",
  success:
    "The change was recorded and the invitation was queued. Email delivery is a separate step.",
  choose: "Choose…",
  denied: "You do not have permission to manage access.",
  back: "Back to the workspace",
};
type Copy = { [K in keyof typeof en]: string };
const bg: Copy = {
  title: "Управление на достъпа",
  lead: "Поканете човек с конкретни права или възстановете достъпа на служител след проверка на самоличността.",
  staffTitle: "Покана за служител",
  name: "Име и фамилия",
  email: "Имейл адрес",
  role: "Роля на служителя",
  invite: "Добавяне на поканата за изпращане",
  recoveryTitle: "Възстановяване на достъп",
  member: "Служител",
  evidence: "Как проверихте самоличността на човека",
  recoveryNote:
    "Това отменя текущите сесии и ключове за достъп. Служителят трябва да регистрира два нови ключа.",
  confirm: "Проверих самоличността на човека и прегледах промяната на достъпа.",
  recover: "Отмяна на стария достъп и възстановяване",
  clientTitle: "Покана за клиент",
  case: "Случай",
  participant: "Роля на участника",
  success:
    "Промяната е записана, а поканата е добавена за изпращане. Доставката на имейла е отделна стъпка.",
  choose: "Изберете…",
  denied: "Нямате права за управление на достъпа.",
  back: "Назад към работното пространство",
};
const ru: Copy = {
  title: "Управление доступом",
  lead: "Пригласите человека с конкретными правами или восстановите доступ сотрудника после проверки личности.",
  staffTitle: "Пригласить сотрудника",
  name: "Имя и фамилия",
  email: "Электронная почта",
  role: "Роль сотрудника",
  invite: "Поставить приглашение в очередь",
  recoveryTitle: "Восстановить доступ",
  member: "Сотрудник",
  evidence: "Как вы проверили личность человека",
  recoveryNote:
    "Текущие сеансы и ключи будут отозваны. Сотруднику потребуется зарегистрировать два новых ключа.",
  confirm: "Я проверил личность человека и изменение доступа.",
  recover: "Отозвать старый доступ и восстановить",
  clientTitle: "Пригласить клиента",
  case: "Дело",
  participant: "Роль участника",
  success: "Изменение записано, приглашение поставлено в очередь. Доставка письма — отдельный шаг.",
  choose: "Выберите…",
  denied: "У вас нет прав управления доступом.",
  back: "Назад в рабочее пространство",
};
export const managementCopy = (locale: string): Copy =>
  locale === "bg" ? bg : locale === "ru" ? ru : en;

const staffRoleLabels = {
  en: {
    assigned_broker: "Broker",
    coordinator: "Coordinator",
    content_editor: "Content editor",
    translation_reviewer: "Translation reviewer",
    publishing_approver: "Publishing approver",
    manager: "Manager",
  },
  bg: {
    assigned_broker: "Брокер",
    coordinator: "Координатор",
    content_editor: "Редактор",
    translation_reviewer: "Рецензент на преводи",
    publishing_approver: "Одобряващ публикации",
    manager: "Ръководител",
  },
  ru: {
    assigned_broker: "Брокер",
    coordinator: "Координатор",
    content_editor: "Редактор",
    translation_reviewer: "Рецензент переводов",
    publishing_approver: "Утверждающий публикации",
    manager: "Руководитель",
  },
};
export function staffRoleLabel(locale: string, role: keyof typeof staffRoleLabels.en): string {
  return staffRoleLabels[locale === "bg" || locale === "ru" ? locale : "en"][role];
}
