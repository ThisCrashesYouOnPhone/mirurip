import React from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { Relation } from '../../index';

const SeasonCardContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: left;
  gap: 1rem;
  margin-top: 1rem;
  margin-bottom: 1rem;
  @media (max-width: 500px) {
    justify-content: center;
  }
`;

const SeasonCard = styled(Link)`
  flex: 1 1 16rem;
  min-width: 14rem;
  background-size: cover;
  background-position: center;
  padding: 0.9rem;
  height: 6rem;
  width: min(100%, 22rem);
  @media (max-width: 500px) {
    height: 3rem;
    flex-basis: 100%;
    min-width: 0;
    width: 100%;
    padding: 1.3rem;
  }
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  border-radius: 0.3rem;
  box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  cursor: pointer;
  text-decoration: none;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    border-radius: var(--global-border-radius);
    z-index: 1;
  }
  transition: transform 0.2s ease-in-out;

  &:hover,
  &:active,
  &:focus {
    transform: translateY(-5px);
    @media (max-width: 500px) {
      transform: none;
    }
  }
`;

const Content = styled.div`
  position: relative;
  z-index: 2;
`;

const SeasonName = styled.div`
  font-size: 0.9rem;
  @media (max-width: 500px) {
    display: none;
    width: 8rem;
    font-size: 0.8rem;
  }
  color: white;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
`;

const RelationType = styled.div`
  font-size: 1.3rem;
  @media (max-width: 500px) {
    font-size: 1.1rem;
    width: 8rem;
    margin-bottom: 0.25rem;
  }
  font-weight: bold;
  color: white;
  border-radius: var(--global-border-radius);
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
  margin-bottom: 0.75rem;
`;

export function sortSeasonRelations(relations: Relation[]): Relation[] {
  return [...relations].sort((a, b) => {
    const dateDifference = (a.releaseDate || 0) - (b.releaseDate || 0);
    if (dateDifference !== 0) return dateDifference;
    const yearDifference = (a.seasonYear || 0) - (b.seasonYear || 0);
    if (yearDifference !== 0) return yearDifference;
    return (a.title.english || a.title.romaji || a.title.userPreferred)
      .localeCompare(b.title.english || b.title.romaji || b.title.userPreferred);
  });
}

export const Seasons: React.FC<{ relations: Relation[] }> = ({ relations }) => {
  const sortedRelations = sortSeasonRelations(relations);

  const getSeasonLabel = (relation: Relation) => {
    if (relation.relationType === 'CURRENT') return 'Now watching';
    if (relation.seasonYear && relation.season) {
      return `${relation.season[0]}${relation.season.slice(1).toLowerCase()} ${relation.seasonYear}`;
    }
    return relation.relationType === 'SEQUEL' ? 'Sequel' : 'Prequel';
  };

  return (
    <SeasonCardContainer>
      {sortedRelations.map((relation) => (
        (() => {
          const artwork = relation.image || relation.cover || '';
          const title = relation.title.english || relation.title.romaji || relation.title.userPreferred;
          return (
        <SeasonCard
          key={relation.id}
          to={`/watch/${relation.id}`}
          title={`Watch ${title}`}
          aria-label={`Watch ${title}`}
          style={{ backgroundImage: artwork ? `url(${artwork})` : undefined }}
        >
          <img
            src={artwork}
            alt={`${title} Cover`}
            style={{ display: 'none' }}
          />
          <Content>
            <RelationType>{getSeasonLabel(relation)}</RelationType>
            <SeasonName>
              {relation.title.english ||
                relation.title.romaji ||
                relation.title.userPreferred}
            </SeasonName>
          </Content>
        </SeasonCard>
          );
        })()
      ))}
    </SeasonCardContainer>
  );
};
