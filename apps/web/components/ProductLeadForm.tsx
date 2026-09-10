import type { ComponentProps } from "react";
import type { DevicePageSettings } from "@vtoroy/shared";
import { ProductLeadFormClient } from "./ProductLeadFormClient";
type ProductLeadCopy = DevicePageSettings["leadForm"];
const fallbackLeadCopy: ProductLeadCopy = {
  available: {
    kind: "purchase",
    scenario: "Записаться на просмотр",
    title: "Проверить наличие и записаться",
    contactPlaceholder: "Телефон или Telegram",
    messagePlaceholder: "Например, хочу посмотреть сегодня после 18:00",
    submitLabel: "Записаться на просмотр",
    submittingLabel: "Отправляем...",
    idleNote: "Заявка будет привязана к этой карточке и текущим условиям.",
    successNote: "Заявка принята. Мы свяжемся и подтвердим наличие.",
    errorNote: "Оставьте контакт, пройдите проверку или попробуйте отправить ещё раз.",
    statusNote: "Устройство сейчас доступно. После заявки мы подтвердим наличие и время просмотра.",
    consentNote: "Нажимая кнопку, вы соглашаетесь на обработку контакта для ответа по заявке.",
  },
  reserved: {
    kind: "purchase",
    scenario: "Встать в лист ожидания по брони",
    title: "Встать в лист ожидания",
    contactPlaceholder: "Телефон или Telegram",
    messagePlaceholder: "Например, если бронь освободится, готов посмотреть сегодня",
    submitLabel: "Встать в лист ожидания",
    submittingLabel: "Отправляем...",
    idleNote: "Заявка будет привязана к этой карточке и текущему статусу.",
    successNote:
      "Заявка принята. Мы свяжемся, если бронь освободится или появится близкая альтернатива.",
    errorNote: "Оставьте контакт, пройдите проверку или попробуйте отправить ещё раз.",
    statusNote:
      "Устройство сейчас в брони. Мы не обещаем продажу, но можем поставить вас следующим в очередь.",
    consentNote: "Нажимая кнопку, вы соглашаетесь на обработку контакта для ответа по заявке.",
  },
  sold: {
    kind: "selection",
    scenario: "Подобрать похожее устройство",
    title: "Подобрать альтернативу",
    contactPlaceholder: "Телефон или Telegram",
    messagePlaceholder: "Например, хочу похожий iPhone с таким же объёмом памяти",
    submitLabel: "Подобрать альтернативу",
    submittingLabel: "Отправляем...",
    idleNote: "Заявка сохранит контекст этой карточки, чтобы подбор был точнее.",
    successNote:
      "Заявка принята. Мы предложим похожую вещь из круга или сообщим, когда она появится.",
    errorNote: "Оставьте контакт, пройдите проверку или попробуйте отправить ещё раз.",
    statusNote: "Эта вещь уже продана. Можно оставить заявку на похожую модель.",
    consentNote: "Нажимая кнопку, вы соглашаетесь на обработку контакта для ответа по заявке.",
  },
};

export function ProductLeadForm({
  leadCopy = fallbackLeadCopy,
  ...props
}: Omit<ComponentProps<typeof ProductLeadFormClient>, "leadCopy"> & {
  leadCopy?: ProductLeadCopy;
}) {
  return <ProductLeadFormClient {...props} leadCopy={leadCopy} />;
}
