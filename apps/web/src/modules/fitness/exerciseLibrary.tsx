/** Visual pill badge showing an exercise's category (strength/cardio/mobility). */
export function CategoryBadge({ category }: { category: string }) {
  const dotClass =
    category === 'cardio'
      ? 'fit-category-badge--cardio'
      : category === 'mobility'
        ? 'fit-category-badge--mobility'
        : 'fit-category-badge--strength'
  return (
    <span className="fit-category-badge">
      <span className={dotClass} />
      {category}
    </span>
  )
}
