function WebchatIcon({ size, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, borderRadius: 4, ...style }}>
      <rect width="20" height="20" rx="5" fill="#7C3AED"/>
      <path d="M4 6.5C4 5.67 4.67 5 5.5 5h9C15.33 5 16 5.67 16 6.5v5c0 .83-.67 1.5-1.5 1.5H11l-3 2.5V13H5.5C4.67 13 4 12.33 4 11.5v-5z" fill="white"/>
    </svg>
  );
}

export default function ChannelLogo({ channel, size = 20, style = {} }) {
  if (channel?.toLowerCase() === 'webchat') return <WebchatIcon size={size} style={style} />;
  const map = {
    whatsapp: '/logos/whatsapp.svg',
    instagram: '/logos/instagram.svg',
    facebook: '/logos/facebook.svg',
    mercadolibre: '/logos/mercadolibre.svg',
    tiendanube: '/logos/tiendanube.svg',
    tiktok: '/logos/tiktok.svg',
  };
  const src = map[channel?.toLowerCase()];
  if (!src) return null;
  return (
    <img
      src={src}
      alt={channel}
      width={size}
      height={size}
      style={{ borderRadius: 4, flexShrink: 0, ...style }}
    />
  );
}
