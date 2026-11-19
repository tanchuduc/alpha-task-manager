import React, { useCallback, useMemo } from 'react';
import { Dropdown, Tooltip, theme, Flex } from '@/shared/antd-imports';
import { GlobalOutlined, CheckOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAppSelector } from '@/hooks/useAppSelector';
import { Language, setLanguage } from '@/features/i18n/localesSlice';
import { useTooltipTheme } from '@/hooks/useTooltipTheme';
import '@/features/navbar/navbar-icon-hover.css';

export const LanguageSwitcherButton: React.FC = () => {
  const dispatch = useAppDispatch();
  const currentLng = useAppSelector(state => state.localesReducer.lng);
  const { i18n } = useTranslation();
  const { tooltipProps } = useTooltipTheme();
  const { token } = theme.useToken();

  const activeLang = useMemo(() => {
    const raw = (currentLng || i18n.language || 'vi').toLowerCase();
    return raw.startsWith('en') ? 'en' : 'vi';
  }, [currentLng, i18n.language]);

  const handleSelectLanguage = useCallback(
    (key: string) => {
      const targetLang = key === 'en' ? Language.EN : Language.VI;
      dispatch(setLanguage(targetLang));
      i18n.changeLanguage(targetLang);
      localStorage.setItem('i18nextLng', targetLang);
    },
    [dispatch, i18n]
  );

  const menuItems: MenuProps['items'] = useMemo(
    () => [
      {
        key: 'vi',
        label: (
          <Flex align="center" justify="space-between" style={{ minWidth: 140, padding: '4px 0' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: activeLang === 'vi' ? 600 : 400 }}>
              <span style={{ fontSize: 16 }}>🇻🇳</span>
              <span>Tiếng Việt</span>
            </span>
            {activeLang === 'vi' && <CheckOutlined style={{ color: token.colorPrimary, fontSize: 13 }} />}
          </Flex>
        ),
        onClick: () => handleSelectLanguage('vi'),
      },
      {
        key: 'en',
        label: (
          <Flex align="center" justify="space-between" style={{ minWidth: 140, padding: '4px 0' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: activeLang === 'en' ? 600 : 400 }}>
              <span style={{ fontSize: 16 }}>🇬🇧</span>
              <span>English</span>
            </span>
            {activeLang === 'en' && <CheckOutlined style={{ color: token.colorPrimary, fontSize: 13 }} />}
          </Flex>
        ),
        onClick: () => handleSelectLanguage('en'),
      },
    ],
    [activeLang, handleSelectLanguage, token.colorPrimary]
  );

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
      <Tooltip
        title={activeLang === 'vi' ? 'Chọn ngôn ngữ (Đang dùng: Tiếng Việt)' : 'Select Language (Current: English)'}
        trigger="hover"
        {...tooltipProps}
      >
        <button
          type="button"
          className="navbar-icon-hover"
          aria-label="Language selection"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            border: 'none',
            background: 'transparent',
            color: 'inherit',
          }}
        >
          <GlobalOutlined style={{ fontSize: 18 }} />
          <span
            style={{
              fontSize: 11,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: token.colorTextSecondary,
            }}
          >
            {activeLang === 'vi' ? 'VI' : 'EN'}
          </span>
        </button>
      </Tooltip>
    </Dropdown>
  );
};

export default LanguageSwitcherButton;
