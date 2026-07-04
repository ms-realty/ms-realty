# Avatar

Person circle — agents, clients, leads. Initials derived from `name` (Cyrillic-safe) on a soft tone, or a photo via `src`.

```jsx
<Avatar name="Мария Стоянова" />
<Avatar name="Peter de Vries" tone="ink" size={44} />
<Avatar name="Елена Георгиева" solid tone="ink" />
<Avatar name="Agent" src="/photos/maria.jpg" size={52} />

<AvatarGroup>
  <Avatar name="Мария Стоянова" size={30} />
  <Avatar name="Петър Илиев" size={30} tone="ink" />
  <Avatar name="Елена Георгиева" size={30} />
</AvatarGroup>
```

- Default `tone="stone"`; `solid` only when one person must stand out (assigned agent).
- Sizes: 24 table rows · 30–36 lists · 44–52 cards · 64+ profiles.
