import { useEffect, useMemo, useState } from 'react'
import { getFeedIconText, isFeedIconImage } from './icon'

type FeedIconBadgeProps = {
  title: string
  icon?: string
  alt: string
  className?: string
  imageClassName?: string
  textClassName?: string
}

export const FeedIconBadge = ({
  title,
  icon,
  alt,
  className = '',
  imageClassName = '',
  textClassName = '',
}: FeedIconBadgeProps) => {
  const normalizedIcon = useMemo(() => (typeof icon === 'string' ? icon.trim() : ''), [icon])
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [normalizedIcon])

  if (!imageFailed && isFeedIconImage(normalizedIcon)) {
    return (
      <img
        src={normalizedIcon}
        alt={alt}
        loading="lazy"
        className={className || imageClassName}
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <span className={className || textClassName}>
      {getFeedIconText(title, normalizedIcon)}
    </span>
  )
}

