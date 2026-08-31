import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { SkeletonCard, StatusIndicator, type Anime } from '../../index';
import { FaPlay } from 'react-icons/fa';
import { TbCards } from 'react-icons/tb';
import { FaStar, FaCalendarAlt } from 'react-icons/fa';
import { AvailabilityBadges } from '../shared/AvailabilityBadges';

const StyledCardWrapper = styled(Link)`
  color: var(--global-text);
  text-decoration: none;
  &:hover,
  &:active,
  &:focus {
    z-index: 2;
  }
`;

const StyledCardItem = styled.div`
  width: 100%;
  border-radius: var(--global-border-radius);
  cursor: pointer;
  transform: translateZ(0);
  transition: transform 0.2s ease-in-out;
`;

const ImageDisplayWrapper = styled.div`
  transition: transform 0.2s ease-in-out;
  @media (min-width: 501px) {
    &:hover,
    &:active,
    &:focus {
      transform: translateY(-6px);
    }
  }
`;

const AnimeImage = styled.div`
  position: relative;
  text-align: left;
  overflow: hidden;
  border-radius: var(--global-border-radius);
  padding-top: calc(100% * 184 / 133);
  background: var(--global-card-bg);
  box-shadow: 0 2px 6px var(--global-card-shadow);
  transition: background-color 0.2s ease-in-out;
`;

const PlayIcon = styled(FaPlay)`
  position: absolute;
  top: 50%;
  left: 50%;
  color: #fff;
  transform: translate(-50%, -50%);
  font-size: 2rem;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 1;
`;

const ImageWrapper = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;

  img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--global-border-radius);
    transition: filter 0.2s ease-in-out;
  }

  &:hover img {
    filter: brightness(0.6);
  }

  &:hover ${PlayIcon} {
    opacity: 1;
  }
`;

const TitleContainer = styled.div<{ $isHovered: boolean }>`
  display: flex;
  align-items: center;
  padding: 0.5rem;
  margin-top: 0.35rem;
  gap: 0.4rem;
  border-radius: var(--global-border-radius);
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover,
  &:active,
  &:focus {
    background: var(--global-card-title-bg);
  }
`;

const Title = styled.h5<{ $isHovered: boolean; color?: string }>`
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: ${(props) => (props.$isHovered ? props.color : 'var(--title-color)')};
  transition: color 0.15s ease-in-out;

  @media (max-width: 500px) {
    font-size: 0.75rem;
  }
`;

const ImgDetail = styled.p<{ $isHovered: boolean; color?: string }>`
  position: absolute;
  bottom: 0;
  margin: 0.25rem;
  padding: 0.2rem 0.4rem;
  font-size: 0.75rem;
  font-weight: bold;
  color: ${(props) => props.color || '#fff'};
  opacity: 0.95;
  background-color: rgba(15, 15, 15, 0.85);
  border-radius: var(--global-border-radius);
`;

const CardDetails = styled.div`
  width: 100%;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-weight: 600;
  font-size: 0.75rem;
  color: rgba(102, 102, 102, 0.8);
  margin: 0;
  display: flex;
  align-items: center;
  padding: 0.2rem 0rem;
  gap: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  > svg {
    margin-bottom: 0.1rem;
    margin-right: -0.3rem;
  }
`;

export const CardItem: React.FC<{ anime: Anime }> = React.memo(({ anime }) => {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const imageSrc = anime.image || anime.cover || '';
  const animeColor = anime.color || '#8080cf';
  const displayTitle = useMemo(
    () => anime.title?.english || anime.title?.romaji || anime.title?.userPreferred || 'No Title',
    [anime.title],
  );

  const truncateTitle = useMemo(
    () => (title: string, maxLength: number) =>
      title.length > maxLength ? `${title.slice(0, maxLength)}...` : title,
    [],
  );

  if (!anime || !anime.id) {
    return <SkeletonCard />;
  }

  return (
    <StyledCardWrapper
      to={`/watch/${anime.id}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      color={animeColor}
      title={displayTitle}
    >
      <StyledCardItem>
        <ImageDisplayWrapper>
          <AnimeImage>
            <ImageWrapper>
              <img
                src={imageSrc}
                onLoad={() => setImgLoaded(true)}
                loading='lazy'
                decoding='async'
                alt={`${displayTitle} Cover`}
                style={{ opacity: imgLoaded ? 1 : 0.8 }}
              />
              <PlayIcon title={`Play ${displayTitle}`} />
            </ImageWrapper>
            {isHovered && (
              <ImgDetail $isHovered={isHovered} color={animeColor}>
                {anime.type || 'Anime'}
              </ImgDetail>
            )}
          </AnimeImage>
        </ImageDisplayWrapper>
        <TitleContainer $isHovered={isHovered}>
          <StatusIndicator status={anime.status} />
          <Title
            $isHovered={isHovered}
            color={animeColor}
            title={`Title: ${displayTitle}`}
          >
            {truncateTitle(displayTitle, 35)}
          </Title>
        </TitleContainer>
        <div>
          <CardDetails title='Romaji Title'>
            {truncateTitle(anime.title?.romaji || displayTitle, 24)}
          </CardDetails>
          <CardDetails title='Card Details'>
            {anime.releaseDate ? (
              <>
                <FaCalendarAlt />
                {anime.releaseDate}
              </>
            ) : null}
            {anime.totalEpisodes ? (
              <>
                <TbCards />
                {anime.totalEpisodes}
              </>
            ) : null}
            {anime.rating ? (
              <>
                <FaStar />
                {typeof anime.rating === 'number' ? anime.rating.toFixed(1) : anime.rating}
              </>
            ) : null}
            <AvailabilityBadges animeId={anime.id} title={displayTitle} />
          </CardDetails>
        </div>
      </StyledCardItem>
    </StyledCardWrapper>
  );
});
