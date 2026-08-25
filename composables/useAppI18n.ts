import { appLocales, type AppLocale } from "~/lib/types";
import { translate, type TranslationKey } from "~/lib/i18n";
import useAuthStore from "~/stores/auth";

type TranslationParams = Record<string, string | number>;

export const useAppI18n = () => {
  const authStore = useAuthStore();

  const locale = computed<AppLocale>(() => {
    const value = authStore.user?.locale;
    return appLocales.includes(value as AppLocale) ? (value as AppLocale) : "en";
  });

  const t = (key: TranslationKey, params: TranslationParams = {}) =>
    translate(locale.value, key, params);

  return { locale, t };
};
